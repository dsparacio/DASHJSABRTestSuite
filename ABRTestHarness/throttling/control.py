# prepare: ipfw add 50 pipe 1 tcp from any 80 to any
# run:     python3 control.py 8081

import sys
import os
import signal
import subprocess
import socketserver
import http.server

if len(sys.argv) == 2:
    server_address = ('', int(sys.argv[1]))
elif len(sys.argv) == 3:
    server_address = (sys.argv[1], int(sys.argv[2]))
else:
    server_address = ('', 8000)

def HandleInterrupt(signal, frame):
    os._exit(0)

signal.signal(signal.SIGINT, HandleInterrupt)

def SetNetwork(bw, delay, queue):
    try:
        cmd = ['/sbin/ipfw', 'pipe', '1', 'config']
        if bw != None:
            cmd += ['bw', '%dKbit/s' % bw]
        if delay != None:
            cmd += ['delay', '%dms' % delay]
        if queue != None:
            cmd += ['queue', '%d' % queue]
        print(' '.join(cmd))
        returncode = subprocess.call(cmd)
        if returncode != 0:
            print('/sbin/ipfw returncode %d' % returncode)
            return False
        return True
    except:
        print('Cannot call /sbin/ipfw')
        return False

def UseSettings(path):
    bw = None
    delay = None
    queue = None
    malformed = (400, 'Malformed request')
    try:
        settings = path.split('?')
        if len(settings) < 1 or settings[0] != '/settings':
            return (404, 'File not found')

        if len(settings) > 2:
            return malformed

        if len(settings) == 2 and len(settings[1]) > 0:
            for setting in settings[1].split('&'):
                s = setting.split('=')
                if len(s) != 2:
                    return malformed
                if s[0] == 'bw':
                    i = s[1].index('Kbps')
                    if len(s[1]) != i + len('Kbps'):
                        return malformed
                    bw = int(s[1][0:i])
                elif s[0] == 'delay':
                    i = s[1].index('ms')
                    if len(s[1]) != i + len('ms'):
                        return malformed
                    delay = int(s[1][0:i])
                elif s[0] == 'queue':
                    queue = int(s[1])
                else:
                    return malformed

    except:
        return malformed

    if not SetNetwork(bw, delay, queue):
        return (500, 'Failed request')

    delim = ''
    content = '{'
    if bw != None:
        content += '%s"bw": "%dKbit/s"' % (delim, bw)
        delim = ', '
    if delay != None:
        content += '%s"delay": "%dms"' % (delim, delay)
        delim = ', '
    if queue != None:
        content += '%s"queue": "%d"' % (delim, queue)
        delim = ', '
    content += '}'
    return (200, content)

class ThreadedTCPServer(socketserver.ThreadingMixIn, socketserver.TCPServer):

    allow_reuse_addr = True

class Handler(http.server.SimpleHTTPRequestHandler):

    protocol_version = 'HTTP/1.1'

    def do_GET(self):
        (status, content) = UseSettings(self.path)
        if status == 200:
            content_bytes = content.encode('ascii')
            self.send_response(status)
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', len(content_bytes))
            self.end_headers()
            self.wfile.write(content_bytes)
        else:
            self.send_error(status, content)

httpd = ThreadedTCPServer(server_address, Handler)
sa = httpd.socket.getsockname()
print("Serving HTTP on", sa[0], "port", sa[1], "...")

httpd.serve_forever()
