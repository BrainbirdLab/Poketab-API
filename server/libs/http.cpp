#include <iostream>
#include <string>
#include <sstream>
#include <fstream>
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

//Request and Response classes
class Request {
public:
    std::string method; // GET, POST, PUT, DELETE
    std::string path; // /about, /contact
    std::string body; 
    std::map<std::string, std::string> headers;
    std::map<std::string, std::string> query;
    std::map<std::string, std::string> params; // /post/:id

    Request() {}
};

class Response {
public:
    std::string status; // 200 OK, 404 Not Found
    std::string body;
    std::string headers;

    // Overload the << operator to append data to the body. Like res << "Hello World";
    template <typename T>
    Response& operator<<(const T& data) {
        body += data;
        return *this;
    }

    // Add a header to the response
    Response& header(const std::string& key, const std::string& value) {
        headers += key + ": " + value + "\r\n";
        return *this;
    }

    // Set the status code of the response
    Response& status_code(const int& code) {
        status = std::to_string(code) + " OK\r\n";
        return *this;
    }

    // Send an HTML file as the response
    Response& html(const std::string& path){
        header("Content-Type", "text/html");
        std::fstream file(path, std::ios::in | std::ios::binary);
        if(file.is_open()){
            body = std::string((std::istreambuf_iterator<char>(file)), std::istreambuf_iterator<char>());
            file.close();
        } else {
            status_code(404) << "File Not Found";
        }
        return *this;
    }

    // Send a JSON response
    Response& json(const std::string& data) {
        header("Content-Type", "application/json");
        body = data;
        return *this;
    }

    //Response constructor
    Response() {
        status = "200 OK\r\n";
    }
};

// Split a string by a delimiter. Used to parse the request path.
// Example: split("/about/us", '/') => ["", "about", "us"]
std::vector<std::string> split_(const std::string& path, char delimiter) {
    std::vector<std::string> tokens;
    std::string token;
    std::istringstream iss(path); // Convert the string to a stream
    while (std::getline(iss, token, delimiter)) {
        tokens.push_back(token); // Add the token to the vector
    }
    return tokens;
}

// HTTP server class
class http_server {
public:
    http_server() {
        WSADATA wsaData; // Initialize Winsock
        int iResult = WSAStartup(MAKEWORD(2, 2), &wsaData); // Start Winsock
        if (iResult != 0) {
            std::cerr << "WSAStartup failed: " << iResult << std::endl;
            return;
        }
    }

    ~http_server() {
        WSACleanup();
    }

    // Set the public directory path
    void publicDir(const std::string& dir) {
        publicDirPath = dir;
    }

    // Start the server on the specified port
    void start(int port) {
        SOCKET listen_socket = socket(AF_INET, SOCK_STREAM, IPPROTO_TCP); // Create a socket
        if (listen_socket == INVALID_SOCKET) {
            std::cerr << "Error at socket(): " << WSAGetLastError() << std::endl;
            return;
        }

        sockaddr_in service; // The sockaddr_in structure specifies the address family, IP address, and port for the socket that is being bound
        service.sin_family = AF_INET;  // The Internet Protocol version 4 (IPv4) address family
        service.sin_addr.s_addr = INADDR_ANY; // IP address of the server
        service.sin_port = htons(port); // The port number

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
            SOCKET client_socket = accept(listen_socket, NULL, NULL); // Accept a client socket
            if (client_socket == INVALID_SOCKET) {
                std::cerr << "accept failed: " << WSAGetLastError() << std::endl;
                SOCKET_CLOSE(listen_socket);
                WSACleanup(); // Clean up Winsock
                return;
            }

            std::thread t(&http_server::handle_client, this, client_socket); // Create a new thread to handle the client
            t.detach();
        }
    }

    // Add a new route with a GET method
    void get(const std::string& path, std::function<void(Request&, Response&)> callback) {
        assignHandler("GET", path, callback);
    }

    // Add a new route with a POST method
    void post(const std::string& path, std::function<void(Request&, Response&)> callback) {
        assignHandler("POST", path, callback);
    }

private:
    // Map to store the routes
    std::map<std::string, std::map<std::string, std::pair<std::string, std::function<void(Request&, Response&)>>>> routes;
    // Path to the public directory
    std::string publicDirPath;

    // Add event handler to the routes map
    void assignHandler(const std::string& method, const std::string& path, std::function<void(Request&, Response&)> callback){
        std::string newPath = std::regex_replace(path, std::regex("/:\\w+/?"), "/([^/]+)/?");
        routes[method][newPath] = std::pair<std::string, std::function<void(Request&, Response&)>>(path, callback);
    }

    // Handle the client request
    void handle_client(SOCKET client_socket) {
        std::string request = read_request(client_socket);
        std::string method = request.substr(0, request.find(' '));
        std::string path = request.substr(request.find(' ') + 1, request.find(' ', request.find(' ') + 1) - request.find(' ') - 1);

        Response response;
        Request req;

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
                serve_static_file(path, response);
                send_response(client_socket, response);
                SOCKET_CLOSE(client_socket);
                return;
            }
        }

        // Serve static files if not matched by any route
        serve_static_file(path, response);
        send_response(client_socket, response);
        SOCKET_CLOSE(client_socket);
    }

    void serve_static_file(const std::string& path, Response& response) {

        // Determine the content type based on the file extension
        std::string content_type;
        std::string file_extension = path.substr(path.find_last_of('.') + 1);
        if (file_extension == "html") {
            content_type = "text/html";
        } else if (file_extension == "css") {
            content_type = "text/css";
        } else if (file_extension == "js") {
            content_type = "application/javascript";
        } else if (file_extension == "json") {
            content_type = "application/json";
        } else if (file_extension == "jpg" || file_extension == "jpeg") {
            content_type = "image/jpeg";
        } else if (file_extension == "png") {
            content_type = "image/png";
        } else if (file_extension == "gif") {
            content_type = "image/gif";
        } else {
            // Default to octet-stream for unknown file types
            content_type = "application/octet-stream";
        }
        std::fstream file( publicDirPath + path, std::ios::in | std::ios::binary);
        if (file) {
            
            response << std::string((std::istreambuf_iterator<char>(file)), std::istreambuf_iterator<char>());
            file.close();
            // Set the response headers
            response.header("Content-Type", content_type);
        }
    }

    // Read the request from the client
    std::string read_request(SOCKET client_socket) {
        std::string request;
        char buffer[1024]; // Buffer to store the request
        int bytes_received; // Bytes received from the client
        do {
            bytes_received = recv(client_socket, buffer, 1024, 0); // Receive the request
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
        response.headers += "\r\n";
        std::string res = "HTTP/1.1 " + response.status + response.headers + response.body;
        send(client_socket, res.c_str(), res.size(), 0);
    }
};

int main() {

    http_server server; // Create a new server instance

    server.publicDir("public"); // Set the public directory

    // Add a new route
    server.get("/", [](Request& req, Response& res) {
        //send the html file
        res.html("index.html");
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

    server.get("/json", [](Request& req, Response& res) {
        res.json("{\"name\": \"John\", \"age\": 30, \"city\": \"New York\"}");
    });

    server.start(4119); // Start the server on port 4119
    return 0;
}