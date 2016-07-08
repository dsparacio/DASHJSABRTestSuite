# prepare: ipfw add 50 pipe 1 tcp from any 80 to any
# run:     python3 control.py
# need:    response.txt

import sys
import os
import signal
import subprocess
import socketserver
import http.server

server_address = (sys.argv[1], int(sys.argv[2]))

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

def Parse(str, prefix, suffix):
    i = str.find(prefix)
    if i < 0:
        throw
    j = str[i:].find(suffix)
    if j < 0:
        throw
    return int(str[i + len(prefix) : i + j])

def UseSettings(p):
    if not 'settings' in p:
        return False
    try:
        bw = Parse(p, 'bw=', 'Kbps')
        delay = Parse(p, 'delay=', 'ms')
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
