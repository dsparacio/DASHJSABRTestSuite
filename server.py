import os
import signal
import socketserver
import http.server

server_address = ('', 8000)

def HandleInterrupt(signal, frame):
    os._exit(0)

signal.signal(signal.SIGINT, HandleInterrupt)

class ThreadedTCPServer(socketserver.ThreadingMixIn, socketserver.TCPServer):
    pass

class MyHandler(http.server.SimpleHTTPRequestHandler):
    profile_check_request_path = '/profile.json'
    profile_write_file_path = 'profile.json'

    metrics_check_request_path = '/metrics.json'
    metrics_write_file_path = 'metrics.json'

    def do_POST(self):
        if self.path == self.profile_check_request_path :
            write_file_path = self.profile_write_file_path
        elif self.path == self.metrics_check_request_path:
            write_file_path = self.metrics_write_file_path
        else:
            return

        length = self.headers['content-length']
        data = self.rfile.read(int(length))

        with open(write_file_path, 'w') as fh:
            fh.write(data.decode())
        self.path = 'reply.txt'
        http.server.SimpleHTTPRequestHandler.do_GET(self)

Handler = MyHandler
Handler.protocol_version = 'HTTP/1.1'

httpd = ThreadedTCPServer(server_address, Handler)
sa = httpd.socket.getsockname()
print("Serving HTTP on", sa[0], "port", sa[1], "...")

httpd.serve_forever()
