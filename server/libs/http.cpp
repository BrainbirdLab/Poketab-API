#include <iostream>
#include <string>
#include <sstream>
#include <map>
#include <functional>
#include <thread>
#include <chrono>
#include <regex>

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

class Request {
public:
    std::string method;
    std::string path;
    std::string body;
    std::map<std::string, std::string> headers;
    std::map<std::string, std::string> query;
    std::map<std::string, std::string> params;

    Request() {}
};

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

std::vector<std::string> split_(const std::string& path, char delimiter) {
    std::vector<std::string> tokens;
    std::string token;
    std::istringstream iss(path);
    while (std::getline(iss, token, delimiter)) {
        tokens.push_back(token);
    }
    return tokens;
}

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
            SOCKET_CLOSE(listen_socket);
            return;
        }

        if (listen(listen_socket, SOMAXCONN) == SOCKET_ERROR) {
            std::cerr << "Error listening on socket." << std::endl;
            SOCKET_CLOSE(listen_socket);
            return;
        }

        std::cout << "Server is listening on port " << port << std::endl;

        while (true) {
            SOCKET client_socket = accept(listen_socket, NULL, NULL);
            if (client_socket == INVALID_SOCKET) {
                std::cerr << "accept failed: " << WSAGetLastError() << std::endl;
                SOCKET_CLOSE(listen_socket);
                WSACleanup();
                return;
            }

            std::thread t(&http_server::handle_client, this, client_socket);
            t.detach();
        }
    }

    void get(const std::string& path, std::function<void(Request&, Response&)> callback) {
        assignHandler("GET", path, callback);
    }

    void post(const std::string& path, std::function<void(Request&, Response&)> callback) {
        assignHandler("POST", path, callback);
    }

private:
    std::map<std::string, std::map<std::string, std::pair<std::string, std::function<void(Request&, Response&)>>>> routes;

    void assignHandler(const std::string& method, const std::string& path, std::function<void(Request&, Response&)> callback){
        std::string newPath = std::regex_replace(path, std::regex("/:\\w+/?"), "/([^/]+)/?");
        routes[method][newPath] = std::pair<std::string, std::function<void(Request&, Response&)>>(path, callback);
    }

    void handle_client(SOCKET client_socket) {
        std::string request = read_request(client_socket);
        std::string method = request.substr(0, request.find(' '));
        std::string path = request.substr(request.find(' ') + 1, request.find(' ', request.find(' ') + 1) - request.find(' ') - 1);

        Response response;
        Request req;
        // Extract query parameters from path
        if (path.find('?') != std::string::npos) {
            std::string query_string = path.substr(path.find('?') + 1);
            path = path.substr(0, path.find('?'));
            std::istringstream query_iss(query_string);
            std::string query_pair;
            while (std::getline(query_iss, query_pair, '&')) {
                std::string key = query_pair.substr(0, query_pair.find('='));
                std::string value = query_pair.substr(query_pair.find('=') + 1);
                req.query[key] = value;
            }
        }

        std::smatch match;
        for (auto& route : routes[method]) {
            std::string route_path = route.first;

            if (std::regex_match(path, match, std::regex(route_path))) {
                std::regex token_regex(":\\w+");
                std::string originalPath = routes[method][route_path].first;

                std::vector<std::string> tokens = split_(originalPath, '/');
                while (std::regex_search(originalPath, match, token_regex) ) {
                    const std::string match_token = match.str();
                    int position = 0;
                    for (int i = 0; i < tokens.size(); i++) {
                        if (tokens[i] == match_token) {
                            position = i;
                            break;
                        }
                    }

                    std::vector<std::string> path_tokens = split_(path, '/');
                    req.params[match_token.substr(1)] = path_tokens[position];

                    originalPath = match.suffix();
                }

                routes[method][route_path].second(req, response);
                send_response(client_socket, response);
                SOCKET_CLOSE(client_socket);
                return;
            }
        }

        response.status_code(404) << "404 Not Found";
        send_response(client_socket, response);
        SOCKET_CLOSE(client_socket);
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

int main() {
    http_server server;
    server.get("/", [](Request& req, Response& res) {
        res << "<h1>Hello, World!</h1><p>This is a simple HTTP server written in C++.</p>";
    });

    server.get("/about", [](Request& req, Response& res) {
        res.status_code(301) << "About page";
    });

    server.get("/contact", [](Request& req, Response& res) {
        res << "Contact page";
    });

    server.post("/post", [](Request& req, Response& res) {
        res << "POST request";
    });

    server.post("/post/:id", [](Request& req, Response& res) {
        res << "POST request with id: " << req.params["id"];
    });

    server.start(4119);
    return 0;
}
