# Bivrost

Bivrost is a simple web application for sharing a media folder through a browser. It displays video and image files, generates thumbnails, and makes it easy to browse folders and play media over a local network.

## Purpose

This program is intended to:

- share a media folder so it can be accessed from a browser
- display media files in a gallery view
- play videos directly without moving files
- view images directly in the browser
- make media collections easier to access from other devices on the same network

## Installation

### 1. Requirements
Make sure these are installed:

- Node.js
- npm

### 2. Install dependencies
Run this command in the project folder:

```bash
npm install
```

## Run

### Start the application
Run:

```bash
npm start
```

This command builds the project and starts the server.

### Choose the media folder
When the program starts, you will be asked to enter the path of the media folder you want to share.

Example:

```bash
D:\Media
```

Or run it directly with a folder argument:

```bash
npm start -- "D:\Media"
```

### Open in the browser
After the server starts, open this address in a browser:

```text
http://localhost:5000
```

To access it from another device on the same network, use the IP address of the computer running the app, for example:

```text
http://192.168.1.10:5000
```

## Supported Media Formats

### Video

- .mp4
- .mkv
- .avi
- .mov
- .webm

### Images

- .jpg
- .jpeg
- .png
- .webp
- .gif
