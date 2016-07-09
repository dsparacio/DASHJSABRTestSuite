1. Start VirtualBox VM running FreeBSD.
Note: Make sure dummynet is up and running.

2. Redirect ports 8081 and 8082 to VM.

3. Compile proxy in VM.
$> c++ -O3 -std=c++11 -o proxy proxy.cpp
Note: compilation needs psocket.h

4. Run proxy in VM.
$> ./proxy 8082

5. Create pipe in VM for traffic received from http port 80.
#> ipfw add 50 pipe 1 tcp from any 80 to any

6. Run python script in VM to configure pipe.
#> python3 control.py 8081
Note: control.py needs access to response.txt

7. Set browser to use SOCKS5 proxy at localhost:8082
E.g. C:\path\to\chrome.exe --disk-cache-dir=nul --proxy-server="socks5://localhost:8082"

8. Run http server at DASHJSABRTestSuite level.

9. Run test harness.
http://localhost:8000/ABRTestHarness/index.html
