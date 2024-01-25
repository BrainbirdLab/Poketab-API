# Backend Server for Poketab Messenger

## Overview
This backend server is designed to facilitate communication for Poketab Messenger. It leverages various technologies for different functionalities:

### Technologies Used
- **Socket.io**: Enables real-time messaging between users.
- **HTTP API**: Handles file upload and download operations.
- **Redis Database**: Manages user metadata, including userId, chatRoomId, and admin status.
- **Redis Adapter**: Connects all backend instances together to have a seamless communication. Uses pub/sub system.

## Features
- Real-time Messaging: Utilizes Socket.io for seamless real-time communication between users.
- File Upload and Download: Offers an HTTP API for efficient file transfer.
- User Metadata Management: Uses Redis to store and manage user metadata, enhancing performance and scalability.

## Usage
1. **Socket.io Connection**: Establishes and maintains Socket.io connections for real-time messaging.
2. **HTTP API**: Provides endpoints for file upload and download operations.
3. **Redis Database**: Configures and manages Redis to store and retrieve user metadata efficiently.

## Note
This server does not store any message content. It solely focuses on managing user metadata and facilitating real-time communication.

