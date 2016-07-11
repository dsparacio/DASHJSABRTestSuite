# prepare: ipfw add 50 pipe 1 tcp from any 80 to any
# run:     python3 control.py 8081
# need:    response.txt

import sys
import os
import signal
import subprocess
import socketserver
import http.server

server_address = ('', int(sys.argv[1]))

def HandleInterrupt(signal, frame):
    os._exit(0)

signal.signal(signal.SIGINT, HandleInterrupt)

class ThreadedTCPServer(socketserver.ThreadingMixIn, socketserver.TCPServer):
    pass

def SetNetwork(bw, delay):
    try:
        subprocess.call(['/sbin/ipfw', 'pipe', '1', 'config', 'bw', '%dKbit/s' % bw, 'delay', '%dms' % delay, 'queue', '50'])
    except:
        print('ERROR: Cannot call ipfw.')
        # TODO: return some useful http status

def UseSettings(path):
    try:
        str = '/settings?bw=';
        if path.index(str) != 0:
            return False
        path = path[len(str):]

        str = 'Kbps'
        i = path.index(str)
        bw = int(path[0:i])
        path = path[i + len(str):]

        str = '&delay='
        if path.index(str) != 0:
            return False
        path = path[len(str):]

        str = 'ms'
        i = path.index(str)
        delay = int(path[0:i])
        path = path[i + len(str):]

        if len(path) != 0:
            return False
    except:
        return False

    SetNetwork(bw, delay)
    return True

class Handler(http.server.SimpleHTTPRequestHandler):

    def do_GET(self):
        if UseSettings(self.path):
            self.path = 'response.txt'
            http.server.SimpleHTTPRequestHandler.do_GET(self)
        else:
            self.send_error(404, "File not found")

    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        http.server.SimpleHTTPRequestHandler.end_headers(self)

Handler.protocol_version = 'HTTP/1.1'

httpd = ThreadedTCPServer(server_address, Handler)
sa = httpd.socket.getsockname()
print("Serving HTTP on", sa[0], "port", sa[1], "...")

httpd.serve_forever()
