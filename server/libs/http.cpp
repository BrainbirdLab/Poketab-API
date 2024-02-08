//http server from scratch without 3rd party libraries

#include <iostream>
#include <string>
#include <sstream>
#include <map>
#include <functional>
#include <thread>

// Platform-specific includes and macros
#ifdef _WIN32
#include <winsock2.h>
#include <ws2tcpip.h>
#include <WS2spi.h>
#define SOCKET_CLOSE(sock) closesocket(sock)
#else
#include <unistd.h>
#include <sys/socket.h>
#include <arpa/inet.h>
#define SOCKET int
#define INVALID_SOCKET -1
#define SOCKET_CLOSE(sock) close(sock)
#endif

class Response {
public:
    std::string status;
    std::string body;
    std::string headers;
    
    int requestTime = 0;

    template <typename T>
    Response& operator<<(const T& data) {
        body += data;
        return *this;
    }

    Response& header(const std::string& key, const std::string& value) {
        headers += key + ": " + value + "\r\n";
        return *this;
    }

    Response& status_code(const int& code) {
        status = std::to_string(code) + " OK\r\n";
        return *this;
    }

    //send html response
    Response& html(const std::string& data) {
        header("Content-Type", "text/html");
        body = data;
        return *this;
    }

    Response() {
        requestTime = std::chrono::duration_cast<std::chrono::milliseconds>(std::chrono::system_clock::now().time_since_epoch()).count();
        status = "200 OK\r\n";
        headers = "Content-Type: text/html\r\n";
    }
};

class http_server {
public:
    http_server() {
        WSADATA wsaData;
        int iResult = WSAStartup(MAKEWORD(2, 2), &wsaData);
        if (iResult != 0) {
            std::cerr << "WSAStartup failed: " << iResult << std::endl;
            return;
        }
    }

    ~http_server() {
        WSACleanup();
    }

    void start(int port) {
        SOCKET listen_socket = socket(AF_INET, SOCK_STREAM, IPPROTO_TCP);
        if (listen_socket == INVALID_SOCKET) {
            std::cerr << "Error at socket(): " << WSAGetLastError() << std::endl;
            return;
        }

        sockaddr_in service;
        service.sin_family = AF_INET;
        service.sin_addr.s_addr = INADDR_ANY;
        service.sin_port = htons(port);

        if (bind(listen_socket, (SOCKADDR*)&service, sizeof(service)) == SOCKET_ERROR) {
            std::cerr << "bind() failed." << std::endl;
            closesocket(listen_socket);
            return;
        }

        if (listen(listen_socket, 1) == SOCKET_ERROR) {
            std::cerr << "Error listening on socket." << std::endl;
            closesocket(listen_socket);
            return;
        }

        std::cout << "Server is listening on port " << port << std::endl;

        while (true) {
            SOCKET client_socket = accept(listen_socket, NULL, NULL);
            if (client_socket == INVALID_SOCKET) {
                std::cerr << "accept failed: " << WSAGetLastError() << std::endl;
                closesocket(listen_socket);
                WSACleanup();
                return;
            }

            std::thread t(&http_server::handle_client, this, client_socket);
            t.detach();
        }
    }

    void get(const std::string& path, std::function<void(Response&)> callback) {
        routes["GET"][path] = callback;
    }

    void post(const std::string& path, std::function<void(Response&)> callback) {
        routes["POST"][path] = callback;
    }

private:
    std::map<std::string, std::map<std::string, std::function<void(Response&)>>> routes;

    void handle_client(SOCKET client_socket) {
        std::string request = read_request(client_socket);
        std::string method = request.substr(0, request.find(' '));
        std::string path = request.substr(request.find(' ') + 1, request.find(' ', request.find(' ') + 1) - request.find(' ') - 1);

        std::cout << "Request: " << method << " " << path << std::endl;

        Response response;

        if (routes.find(method) != routes.end() && routes[method].find(path) != routes[method].end()) {
            routes[method][path](response);
        }
        else {
            response.status_code(404) << "Not Found";
        }

        //add response headers
        //response << "HTTP/1.1 200 OK\r\nContent-Length: " << response.str().size() << "\r\n\r\n";

        send_response(client_socket, response);
        closesocket(client_socket);
    }

    std::string read_request(SOCKET client_socket) {
        std::string request;
        char buffer[1024];
        int bytes_received;
        do {
            bytes_received = recv(client_socket, buffer, 1024, 0);
            if (bytes_received > 0) {
                request.append(buffer, bytes_received);
            }
        } while (bytes_received == 1024);
        return request;
    }

    void send_response(SOCKET client_socket, Response response) {

        response.header("Content-Length", std::to_string(response.body.size()));
        response.header("X-Powered-By", "Xebec-Server/0.1.0");
        response.header("Programming-Language", "C++");
        int responseTime = std::chrono::duration_cast<std::chrono::milliseconds>(std::chrono::system_clock::now().time_since_epoch()).count() - response.requestTime;
        response.header("Server-Response-Time", std::to_string(responseTime) + "ms");
        response.headers += "\r\n";
        std::string res = "HTTP/1.1 " + response.status + response.headers + response.body;
        send(client_socket, res.c_str(), res.size(), 0);
    }
};


// Example usage. Demo html
std::string html = R"(
<!DOCTYPE html>
<html>
<head>
    <title>HTTP Server</title>
</head>
<body>
    <h1>Hello, World!</h1>
    <p>This is a simple HTTP server written in C++.</p>

    <a href="/">Home</a>
    <a href="/about">About</a>
    <a href="/contact">Contact</a>
    
</body>
</html>
)";



int main() {
    http_server server;
    server.get("/", [](Response& response) {
        response << html;
    });

    server.get("/about", [](Response& response) {
        response.status_code(301) << "About page";
    });

    server.get("/contact", [](Response& response) {
        response << "Contact page";
    });

    server.start(4119);
    return 0;
}