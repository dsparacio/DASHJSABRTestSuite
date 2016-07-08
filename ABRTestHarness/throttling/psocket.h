#ifndef PSOCKET_H
#define PSOCKET_H

#ifdef _WIN32

#define _WIN32_WINNT  0x501
//#include <w32api.h>
#include <windows.h>
#include <winsock2.h>
#include <ws2tcpip.h>
#include <assert.h>

typedef char* sockopt_ptr_t;
typedef int sockaddr_len_t;

static int non_block(int fd)
{
    unsigned long mode = 1;
    int r = ioctlsocket(fd, FIONBIO, &mode);
    if (r == 0)
        return 0;
    else
        return -1;
}

static void close_socket(int fd)
{
    closesocket(fd);
}

static int shutdown_socket_send(int fd)
{
    int r = shutdown(fd, SD_SEND);
    if (r == 0)
        return 0;
    else
        return -1;
}

static void init_sockets()
{
    WSADATA wsaData;
    int iResult = WSAStartup(MAKEWORD(2, 2), &wsaData);
    assert(iResult == 0);
}

static unsigned get_raw_clock_ms()
{
    return GetTickCount();
}

static unsigned clock_start = get_raw_clock_ms() - 1;

static unsigned get_clock_ms()
{
    return get_raw_clock_ms() - clock_start;
}

void sleep_ms(int timeout_ms)
{
    if (timeout_ms <= 0)
        return;

    // granularity around 15 ms - make sure to sleep at least timeout_ms
    timeout_ms += 15;

    Sleep(timeout_ms);
}

#else // ifndef _WIN32

#include <time.h>
#include <unistd.h>
#include <fcntl.h>
#include <sys/socket.h>
#include <sys/select.h>
#include <sys/time.h>
#include <netinet/in.h>
#include <netdb.h>

typedef void* sockopt_ptr_t;
typedef socklen_t sockaddr_len_t;

static int non_block(int fd)
{
    int flags = fcntl(fd ,F_GETFL, 0);
    if (flags < 0)
        return -1;
    int r = fcntl(fd, F_SETFL, flags | O_NONBLOCK);
    if (r >= 0)
        return 0;
    else
        return -1;
}

static void close_socket(int fd)
{
    close(fd);
}

static int shutdown_socket_send(int fd)
{
    int r = shutdown(fd, SHUT_WR);
    if (r == 0)
        return 0;
    else
        return -1;
}

static void init_sockets()
{
}

static unsigned get_raw_clock_ms()
{
    struct timespec ts;
    int r = clock_gettime(CLOCK_MONOTONIC, &ts);
    assert(r == 0);
    return ts.tv_sec * 1000 + ts.tv_nsec / 1000000;
}

static unsigned clock_start = get_raw_clock_ms() - 1;

static unsigned get_clock_ms()
{
    return get_raw_clock_ms() - clock_start;
}

void sleep_ms(int timeout_ms)
{
    if (timeout_ms <= 0)
        return;

    struct timeval tv;
    timeout_ms *= 1000;
    tv.tv_sec = timeout_ms / 1000000;
    tv.tv_usec = timeout_ms % 1000000;

    int r = select(0, NULL, NULL, NULL, &tv);
    assert(r == 0);
}

#endif // ifndef _WIN32

#endif // ifndef PSOCKET_H