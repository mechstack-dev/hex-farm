# HexFarm Client

This is the frontend client for HexFarm MMO, built with React and PixiJS.

## General Information
For game mechanics, controls, and project overview, please refer to the [Root README](../README.md).

## Development

### Setup
Ensure you have installed dependencies in the root directory:
```bash
npm install
```

### Running in Development
Start the Vite development server:
```bash
npm run dev
```
Or from the root:
```bash
npm run dev:client
```

### Building for Production
```bash
npm run build
```
The build artifacts will be located in the `dist` directory.

### Tech Stack
- **React:** UI components and state management.
- **PixiJS:** 2D WebGL rendering engine for the hex grid and entities.
- **Socket.io-client:** Real-time communication with the server.
- **Vite:** Build tool and development server.
