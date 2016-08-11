// compile: c++ -O3 -std=c++11 -pthread -o proxy proxy.cpp
// run:     ./proxy 8082

/*
 * Runs in single thread.
 * (Although threading is used for getaddrinfo() name resolution which has no async equivalent).
 *
 * Known issues:
 *
 * 1. Does not support IPv6 connections.
 * 2. Only works if client lists exactly one SOCKS5 method: no authentication.
 * 3. Expects SOCKS5 control messages to be read/written in one recv/send call (highly likely).
 * 4. SOCKS5 error reporting is not done.
 * 5. Does not handle unexpected errors gracefully.
 */

#include <iostream>
#include <list>
#include <string>
#include <sstream>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <assert.h>
#include <inttypes.h>

#include "psocket.h"

const int buffer_size = 128 * 1024;

enum connection_state {
    cs_s5_client_greet,
    cs_s5_server_auth,
    cs_s5_client_request,
    cs_s5_resolving_name,
    cs_connecting,
    cs_established
};

struct name_resolution {
    uint16_t port; // store nbo port here
    volatile int resolved;
    int fd; // fd where to write 1 character when ready (to interrupt select)
    const char* name;
    addrinfo* ai;
};

struct connection {
    connection_state state;
    int fd_a;
    int fd_b;
    bool eof_from_a;
    bool eof_from_b;
    int len_a_to_b;
    int len_b_to_a;
    int offset_a_to_b;
    int offset_b_to_a;
    name_resolution* nr;
    char buffer_a_to_b[buffer_size];
    char buffer_b_to_a[buffer_size];

    connection(int a, int b)
        : state(cs_connecting),
          fd_a(a),
          fd_b(b),
          eof_from_a(false),
          eof_from_b(false),
          len_a_to_b(0),
          len_b_to_a(0),
          offset_a_to_b(0),
          offset_b_to_a(0)
    {
    }

    connection(int a)
        : state(cs_s5_client_greet),
          fd_a(a),
          fd_b(-1),
          eof_from_a(false),
          eof_from_b(false),
          len_a_to_b(0),
          len_b_to_a(0),
          offset_a_to_b(0),
          offset_b_to_a(0)
    {
    }
};

uint32_t parse_addr(const char* text)
{
    unsigned a[4];
    int r = sscanf(text, "%u.%u.%u.%u", a, a + 1, a + 2, a + 3);
    assert(r == 4);
    uint32_t addr = a[0];
    addr <<= 8;
    addr += a[1];
    addr <<= 8;
    addr += a[2];
    addr <<= 8;
    addr += a[3];
    return addr;
}

uint16_t parse_port(const char* text)
{
    unsigned p;
    int r = sscanf(text, "%u", &p);
    assert(r == 1);
    return p;
}

std::string format_addr(uint32_t addr)
{
    std::ostringstream oss;
    oss << ((addr >> 24) & 0xff) << '.'
        << ((addr >> 16) & 0xff) << '.'
        << ((addr >> 8) & 0xff) << '.'
        << (addr & 0xff);
    return oss.str();
}

std::string format_port(uint16_t port)
{
    std::ostringstream oss;
    oss << port;
    return oss.str();
}

int do_recv(int fd, int offset, int& len, char* buffer)
{
    int read_len = buffer_size - len;
    if (offset + len >= buffer_size) {
        // wrap around buffer edge
        offset -= buffer_size;
    } else if (offset + len + read_len > buffer_size) {
        // limit read to buffer edge
        read_len = buffer_size - offset - len;
    }
    int r = recv(fd, buffer + offset + len, read_len, 0);
    if (r > 0) {
        len += r;
    }
    return r;
}

int do_send(int fd, int& offset, int& len, char* buffer)
{
    int write_len = len;
    if (offset + write_len > buffer_size) {
        // limit write to buffer edge
        write_len = buffer_size - offset;
    }
    int r = send(fd, buffer + offset, write_len, 0);
    if (r > 0) {
        len -= r;
        offset += r;
        if (offset == buffer_size) {
            offset = 0;
        }
    }
    return r;
}

void transform_localhost(char* buf, int& n, const char* addr4)
{
    if (buf[3] == 1 && n == 10 && buf[4] == 127) {
        // note that localhost has all 127.0.0.0/8 not just 127.0.0.1
        memcpy(buf + 4, addr4, 4);
        std::cout << "tranform localhost ipv4" << std::endl;
    } else if (buf[3] == 3 && (unsigned char)buf[4] + 7 == n) {
        char tmp = buf[n - 2];
        buf[n - 2] = '\0';
        bool is_lh = ((n == 16 && strcmp(buf + 5, "localhost") == 0) ||
                      (n >= 16 && buf[5] == '1' && buf[6] == '2' && buf[7] == '7' && buf[8] == '.'));
        buf[n - 2] = tmp;
        if (is_lh) {
            memcpy(buf + 8, buf + n - 2, 2);
            memcpy(buf + 4, addr4, 4);
            buf[3] = 1;
            n = 10;
            std::cout << "tranform localhost domain" << std::endl;
        }
    }
}

static void name_resolution_call(void* param)
{
    name_resolution* nr = (name_resolution*)param;

    int r = getaddrinfo(nr->name, NULL, NULL, &nr->ai);
    if (r != 0 || nr->ai->ai_family != AF_INET) {
        if (nr->ai != NULL) {
            freeaddrinfo(nr->ai);
            nr->ai = NULL;
        }
    }

    nr->resolved = 1;

    char c = 0;
    send(nr->fd, &c, 1, 0); // signal to select
}

static name_resolution* start_name_resolution(const char* name, int fd)
{
    name_resolution* nr = new name_resolution;
    nr->resolved = 0;
    nr->fd = fd;
    nr->name = name;
    thread_start(&name_resolution_call, nr);
    return nr;
}

static int finish_name_resolution(name_resolution* nr, sockaddr_in* saddr)
{
    int r = 0;
    if (nr->ai != NULL) {
        memcpy(&saddr->sin_addr.s_addr, &((sockaddr_in*)nr->ai->ai_addr)->sin_addr.s_addr, 4);
        freeaddrinfo(nr->ai);
    } else {
        r = -1;
    }
    delete nr;
    return r;
}

int main(int argc, char** argv)
{
    bool socks5;

    int r;
    init_sockets();

    assert(argc >= 2);

    uint32_t addr = 0;
    uint16_t port = 0;
    if (argc == 2) {
        addr = INADDR_ANY;
        port = parse_port(argv[1]);
    } else {
        addr = parse_addr(argv[1]);
        port = parse_port(argv[2]);
    }
    sockaddr_in saddr;
    sockaddr_len_t saddr_len;
    saddr.sin_family = AF_INET;
    saddr.sin_port = htons(port);
    saddr.sin_addr.s_addr = htonl(addr);

    int server_socket = socket(PF_INET, SOCK_STREAM, 0);
    assert(server_socket >= 0);

    int yes = 1;
    r = setsockopt(server_socket, SOL_SOCKET, SO_REUSEADDR,
                   (sockopt_ptr_t)&yes, sizeof(yes));
    assert(r == 0);

    r = bind(server_socket, (sockaddr*)&saddr, sizeof(saddr));
    assert(r == 0);

    r = listen(server_socket, 16);
    assert(r == 0);

    // create socket pair to interrupt select - pipe() doesn't work on Windows
    int select_interrupter_write = socket(PF_INET, SOCK_STREAM, 0);
    uint32_t localhost = htonl(0x7f000001); // 127.0.0.1
    saddr.sin_addr.s_addr = localhost;
    // keep sin_family and sin_port
    r = connect(select_interrupter_write, (sockaddr*)&saddr, sizeof(saddr));
    assert(r == 0);
    saddr_len = sizeof(saddr);
    r = getsockname(select_interrupter_write, (sockaddr*)&saddr, &saddr_len);
    assert(r == 0);
    assert(saddr.sin_addr.s_addr == localhost);
    port = saddr.sin_port;
    int select_interrupter_read = -1;
    while (select_interrupter_read < 0) {
        saddr_len = sizeof(saddr);
        select_interrupter_read = accept(server_socket, (sockaddr*)&saddr, &saddr_len);
        assert(select_interrupter_read >= 0);
        if (saddr.sin_addr.s_addr != localhost || saddr.sin_port != port) {
            close_socket(select_interrupter_read);
            select_interrupter_read = -1;
        }
    }
    shutdown_socket_send(select_interrupter_read);
    // write to select_interrupter_write to interrupt select
    // use select_interrupter_read in select call

    socks5 = (argc <= 3);

    if (!socks5) {
        assert(argc == 5);
        addr = parse_addr(argv[3]);
        port = parse_port(argv[4]);
        saddr.sin_family = AF_INET;
        saddr.sin_port = htons(port);
        saddr.sin_addr.s_addr = htonl(addr);
        // saddr now is connect-to address
    }

    assert(buffer_size >= 1024);

    std::list<connection*> connections;

    int nfds;
    fd_set readfds;
    fd_set writefds;

    int nfds0 = server_socket;
    if (select_interrupter_read > nfds0) {
        nfds0 = select_interrupter_read;
    }

    for (; ; ) {
        FD_ZERO(&readfds);
        FD_ZERO(&writefds);

        nfds = nfds0;
        FD_SET(server_socket, &readfds);
        FD_SET(select_interrupter_read, &readfds);

        for (auto iter = connections.begin();
             iter != connections.end();
             ++iter) {

            switch ((*iter)->state) {
            case cs_s5_client_greet:
                FD_SET((*iter)->fd_a, &readfds);
                if ((*iter)->fd_a > nfds)
                    nfds = (*iter)->fd_a;
                break;

            case cs_s5_server_auth:
                FD_SET((*iter)->fd_a, &writefds);
                if ((*iter)->fd_a > nfds)
                    nfds = (*iter)->fd_a;
                break;

            case cs_s5_client_request:
                FD_SET((*iter)->fd_a, &readfds);
                if ((*iter)->fd_a > nfds)
                    nfds = (*iter)->fd_a;
                break;

            case cs_s5_resolving_name:
                break;

            case cs_connecting:
                FD_SET((*iter)->fd_b, &writefds);
                if ((*iter)->fd_b > nfds)
                    nfds = (*iter)->fd_b;
                break;

            case cs_established:
                if ((*iter)->len_a_to_b > 0) {
                    if ((*iter)->fd_b > nfds)
                        nfds = (*iter)->fd_b;
                    FD_SET((*iter)->fd_b, &writefds);
                }
                if ((*iter)->len_a_to_b < buffer_size && !(*iter)->eof_from_a) {
                    if ((*iter)->fd_a > nfds)
                        nfds = (*iter)->fd_a;
                    FD_SET((*iter)->fd_a, &readfds);
                }

                if ((*iter)->len_b_to_a > 0) {
                    if ((*iter)->fd_a > nfds)
                        nfds = (*iter)->fd_a;
                    FD_SET((*iter)->fd_a, &writefds);
                }
                if ((*iter)->len_b_to_a < buffer_size && !(*iter)->eof_from_b) {
                    if ((*iter)->fd_b > nfds)
                        nfds = (*iter)->fd_b;
                    FD_SET((*iter)->fd_b, &readfds);
                }
                break;

            default:
                // should not arrive here
                abort();
            }
        }

        ++nfds;

        r = select(nfds, &readfds, &writefds, NULL, NULL);
        assert(r > 0);


        if (FD_ISSET(select_interrupter_read, &readfds)) {
            // This check MUST be performed before iterating through connections.
            // Otherwise, we might clear interruption and not handle it.
            char buf[16]; // 1 should really be enough, but 16 doesn't hurt
            recv(select_interrupter_read, buf, 16, 0);
        }

        for (auto iter = connections.begin(); iter != connections.end(); ) {
            bool del = false;
            const char* fail_txt_1 = nullptr;
            const char* fail_txt_2 = nullptr;
            const char* fail_txt_3 = nullptr;
            char* buf = nullptr;

            switch ((*iter)->state) {
            case cs_s5_client_greet:
                if (!FD_ISSET((*iter)->fd_a, &readfds))
                    break;

                buf = (*iter)->buffer_a_to_b + 4;
                r = recv((*iter)->fd_a, buf, 257, 0);
                if (r < 2 || buf[0] != 5 || (unsigned char)buf[1] + 2 != r) {
                    del = true;
                    fail_txt_1 = "failed reading SOCKS5 client greeting";
                    break;
                }
                (*iter)->state = cs_s5_server_auth;
                break;

            case cs_s5_server_auth:
                if (!FD_ISSET((*iter)->fd_a, &writefds))
                    break;

                buf = (*iter)->buffer_b_to_a;
                buf[0] = 5;
                buf[1] = 0;
                r = send((*iter)->fd_a, buf, 2, 0);
                if (r != 2) {
                    del = true;
                    fail_txt_1 = "failed writing SOCKS5 server reply";
                    break;
                }
                (*iter)->state = cs_s5_client_request;
                break;

            case cs_s5_client_request:
                if (!FD_ISSET((*iter)->fd_a, &readfds))
                    break;

                buf = (*iter)->buffer_a_to_b + 4;
                r = recv((*iter)->fd_a, buf, 262, 0);
                if (r < 5 || buf[0] != 5 || buf[1] != 1 || buf[2] != 0) {
                    del = true;
                    fail_txt_1 = "failed reading SOCKS5 client connect";
                    break;
                }

                // transform_localhost(buf, r, buf - 4); // map localhost to IP of client

                if (buf[3] == 1 && r == 10) {
                    saddr.sin_family = AF_INET;
                    memcpy(&saddr.sin_addr.s_addr, buf + 4, 4);
                    memcpy(&saddr.sin_port, buf + 6, 2);
                } else if (buf[3] == 3 && (unsigned char)buf[4] + 7 == r) {
                    memcpy(&port, buf + r - 2, 2);
                    buf[r - 2] = '\0';
                    (*iter)->nr = start_name_resolution(buf + 5, select_interrupter_write);
                    (*iter)->nr->port = port;
                    (*iter)->state = cs_s5_resolving_name;
                    break;
                } else {
                    del = true;
                    fail_txt_1 = "unknown SOCKS5 address type";
                    break;
                }

                // do not break, run on

            case cs_s5_resolving_name:
                if ((*iter)->state == cs_s5_resolving_name) {
                    // avoid this code in run on case
                    if (!(*iter)->nr->resolved) {
                        break;
                    }
                    buf = (*iter)->buffer_a_to_b + 4;
                    saddr.sin_family = AF_INET;
                    memcpy(&saddr.sin_port, &(*iter)->nr->port, 2);
                    r = finish_name_resolution((*iter)->nr, &saddr);
                    if (r != 0) {
                        del = true;
                        fail_txt_1 = "failed looking up SOCKS5 address \"";
                        fail_txt_2 = buf + 5;
                        fail_txt_3 = "\"";
                        break;
                    }
                }

                assert((*iter)->fd_b == -1);
                (*iter)->fd_b = socket(PF_INET, SOCK_STREAM, 0);
                assert((*iter)->fd_b >= 0);

                r = non_block((*iter)->fd_b);
                assert(r == 0);

                r = connect((*iter)->fd_b, (sockaddr*)&saddr, sizeof(saddr));
                // r != 0 because async (non-blocking)

                std::cout << (*iter)->fd_a << ':' << (*iter)->fd_b << " new out connection - "
                          << format_addr(ntohl(saddr.sin_addr.s_addr)) << ':'
                          << format_port(ntohs(saddr.sin_port));
                if (buf[3] == 3) {
                    std::cout << ' ' << (buf + 5);
                }
                std::cout << std::endl;

                buf = (*iter)->buffer_b_to_a;
                buf[0] = 5;
                buf[1] = 0;
                buf[2] = 0;
                buf[3] = 1;
                memcpy(buf + 4, &saddr.sin_addr.s_addr, 4);
                memcpy(buf + 8, &saddr.sin_port, 2);
                (*iter)->len_b_to_a = 10;

                (*iter)->state = cs_connecting;
                break;

            case cs_connecting:
                if (!FD_ISSET((*iter)->fd_b, &writefds))
                    break;
                if (is_socket_error((*iter)->fd_b)) {
                    del = true;
                    fail_txt_1 = "failed to connect to remote host";
                }

                (*iter)->state = cs_established;
                break;

            case cs_established:
                if (FD_ISSET((*iter)->fd_a, &readfds)) {
                    r = do_recv((*iter)->fd_a,
                                (*iter)->offset_a_to_b,
                                (*iter)->len_a_to_b,
                                (*iter)->buffer_a_to_b);
                    if (r < 0) {
                        del = true;
                        fail_txt_1 = "failed reading from \"in\"";
                    } else if (r == 0) {
                        (*iter)->eof_from_a = true;
                        if ((*iter)->len_a_to_b == 0) {
                            shutdown_socket_send((*iter)->fd_b);
                            if ((*iter)->eof_from_b && (*iter)->len_b_to_a == 0) {
                                del = true;
                            }
                        }
                    }
                }

                if (FD_ISSET((*iter)->fd_b, &readfds)) {
                    r = do_recv((*iter)->fd_b,
                                (*iter)->offset_b_to_a,
                                (*iter)->len_b_to_a,
                                (*iter)->buffer_b_to_a);
                    if (r < 0) {
                        del = true;
                        fail_txt_1 = "failed reading from \"out\"";
                    } else if (r == 0) {
                        (*iter)->eof_from_b = true;
                        if ((*iter)->len_b_to_a == 0) {
                            shutdown_socket_send((*iter)->fd_a);
                            if ((*iter)->eof_from_a && (*iter)->len_a_to_b == 0) {
                                del = true;
                            }
                        }
                    }
                }

                if (!del && FD_ISSET((*iter)->fd_a, &writefds)) {
                    r = do_send((*iter)->fd_a,
                                (*iter)->offset_b_to_a,
                                (*iter)->len_b_to_a,
                                (*iter)->buffer_b_to_a);
                    if (r <= 0) {
                        del = true;
                        fail_txt_1 = "failed writing to \"in\"";
                    } else if ((*iter)->eof_from_b && (*iter)->len_b_to_a == 0) {
                        shutdown_socket_send((*iter)->fd_a);
                        if ((*iter)->eof_from_a && (*iter)->len_a_to_b == 0) {
                            del = true;
                        }
                    }
                }

                if (!del && FD_ISSET((*iter)->fd_b, &writefds)) {
                    r = do_send((*iter)->fd_b,
                                (*iter)->offset_a_to_b,
                                (*iter)->len_a_to_b,
                                (*iter)->buffer_a_to_b);
                    if (r <= 0) {
                        del = true;
                        fail_txt_1 = "failed writing to \"out\"";
                    } else if ((*iter)->eof_from_a && (*iter)->len_a_to_b == 0) {
                        shutdown_socket_send((*iter)->fd_b);
                        if ((*iter)->eof_from_b && (*iter)->len_b_to_a == 0) {
                            del = true;
                        }
                    }
                }

                break;

            default:
                // should not arrive here
                abort();
            }

            auto next = iter;
            ++next;
            if (del) {
                std::cout << (*iter)->fd_a << ':';
                if ((*iter)->fd_b > 0) {
                    std::cout << (*iter)->fd_b;
                } else {
                    std::cout << "...";
                }
                if (fail_txt_1 != nullptr) {
                    std::cout << ' ' << fail_txt_1;
                    if (fail_txt_2 != nullptr) {
                        std::cout << fail_txt_2;
                    }
                    if (fail_txt_3 != nullptr) {
                        std::cout << fail_txt_3;
                    }
                    std::cout << ',';
                }
                std::cout << " disconnected" << std::endl;
                close_socket((*iter)->fd_a);
                close_socket((*iter)->fd_b);
                delete *iter;
                connections.erase(iter);
            }
            iter = next;
        }

        if (FD_ISSET(server_socket, &readfds)) {
            sockaddr_in saddr2;
            sockaddr_len_t saddr2_len = sizeof(saddr2);
            int a = accept(server_socket, (sockaddr*)&saddr2, &saddr2_len);
            assert(a >= 0 && saddr2_len == sizeof(saddr2));

            r = non_block(a);
            assert(r == 0);

            if (!socks5) {
                int b = socket(PF_INET, SOCK_STREAM, 0);
                assert(b >= 0);

                r = non_block(b);
                assert(r == 0);

                r = connect(b, (sockaddr*)&saddr, sizeof(saddr));
                // r != 0 because async (non-blocking)

                std::cout << a << ':' << b << " new connection - "
                          << format_addr(ntohl(saddr2.sin_addr.s_addr)) << ':'
                          << format_port(ntohs(saddr2.sin_port)) << std::endl;

                connections.push_back(new connection(a, b));
            } else {
                std::cout << a << ":... new in connection - "
                          << format_addr(ntohl(saddr2.sin_addr.s_addr)) << ':'
                          << format_port(ntohs(saddr2.sin_port)) << std::endl;

                connections.push_back(new connection(a));
                memcpy(connections.back()->buffer_a_to_b, &saddr2.sin_addr.s_addr, 4);
            }
        }
    }
}
