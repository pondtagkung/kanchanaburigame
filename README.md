# Kanchanaburi History & Tourism Game

An interactive, real-time local multiplayer board game themed around the history and tourism of Kanchanaburi, Thailand. 

The game uses a **Host-Client Architecture**:
- **Host Screen**: A main computer or TV screen displays the game board, player positions, and animations.
- **Player Controllers**: Players use their mobile phones to join the game via a QR Code, roll the dice, and answer questions.

## Tech Stack
- **Frontend**: Vanilla HTML, CSS, JavaScript
- **Backend**: Python 3 (`websockets` and `http.server`)
- **Real-time Communication**: WebSockets

## Requirements
- Python 3.7+
- `websockets` Python package

## How to Run Locally

1. **Install Dependencies**
   Ensure you have Python installed, then install the required `websockets` library:
   ```bash
   pip install websockets
   ```

2. **Start the Server**
   Run the Python server script in the project directory:
   ```bash
   python3 server.py
   ```
   The server will start two services:
   - HTTP File Server on port `8000`
   - WebSocket Server on port `8001`

3. **Open the Host Screen**
   Open your web browser and navigate to:
   ```
   http://localhost:8000
   ```
   *Note: If you are playing with others on different devices, you can also access this via your computer's local network IP (e.g., `http://192.168.1.X:8000`).*

4. **Join the Game via Phone**
   - A QR Code will appear on the Host setup screen.
   - Players must ensure their phones are connected to the **same Wi-Fi network** as the Host computer.
   - Scan the QR code with a phone camera to open the Controller UI.
   - Enter your name and wait for the Host to start the game.

5. **Play!**
   - Click **Start Game** on the Host screen.
   - Follow the turn indicators. When it's your turn, a "Roll Dice" button will appear on your phone.
   - Answer trivia questions and interact with special squares directly from your mobile device!

## Game Board Features
- **32 Squares**: Including questions, special cards (photo bonuses), lucky doors (random chance), and safe zones.
- **Glassmorphism UI**: Beautiful, modern translucent interface.
- **Mobile First Controllers**: The phone UI is optimized for quick tapping and easy reading.
