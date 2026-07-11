import asyncio
import websockets
import json
import socket
import threading
import http.server
import socketserver
import os

HTTP_PORT = 8000
WS_PORT = 8001

def get_local_ip():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        # Connect to an external IP (doesn't need to be reachable) to get the local IP
        s.connect(('10.255.255.255', 1))
        IP = s.getsockname()[0]
    except Exception:
        IP = '127.0.0.1'
    finally:
        s.close()
    return IP

# Game State
class GameState:
    def __init__(self):
        self.host_ws = None
        self.client_sockets = {} # {id: ws}

state = GameState()

async def broadcast_to_clients(message):
    for ws in list(state.client_sockets.values()):
        try:
            await ws.send(json.dumps(message))
        except Exception:
            pass

async def notify_host(message):
    if state.host_ws:
        try:
            await state.host_ws.send(json.dumps(message))
        except Exception as e:
            print(f"Error notifying host: {e}")

async def handler(websocket):
    # Determine remote IP for logging
    client_ip = websocket.remote_address[0]
    
    try:
        async for message in websocket:
            data = json.loads(message)
            action = data.get('action')
            
            if action == 'register_host':
                print("Host registered")
                state.host_ws = websocket
                await websocket.send(json.dumps({
                    'type': 'host_registered',
                    'ip': get_local_ip(),
                    'http_port': HTTP_PORT,
                    'ws_port': WS_PORT
                }))
                
            elif action == 'join_game':
                player_id = data.get('id')
                name = data.get('name')
                print(f"Player joined: {name} ({player_id})")
                state.client_sockets[player_id] = websocket
                await notify_host({'type': 'player_joined', 'id': player_id, 'name': name})
                await websocket.send(json.dumps({'type': 'joined', 'id': player_id}))
                
            elif action == 'roll_dice':
                print(f"Player {data.get('id')} rolled the dice")
                await notify_host({'type': 'roll_dice', 'id': data.get('id')})
                
            elif action == 'answer':
                print(f"Player {data.get('id')} answered {data.get('answer_index')}")
                await notify_host({
                    'type': 'answer', 
                    'id': data.get('id'), 
                    'answer_index': data.get('answer_index')
                })
                
            elif action == 'update_client_ui':
                # Host tells a specific client to change UI state (e.g. show roll button, or show question)
                target_id = data.get('target_id')
                ui_state = data.get('ui_state')
                payload = data.get('payload', {})
                
                msg = {'type': 'ui_update', 'state': ui_state, 'payload': payload}
                
                if target_id == 'all':
                    await broadcast_to_clients(msg)
                elif target_id in state.client_sockets:
                    target_ws = state.client_sockets[target_id]
                    try:
                        await target_ws.send(json.dumps(msg))
                    except Exception as e:
                        print(f"Error sending to client {target_id}: {e}")
                        
    except websockets.exceptions.ConnectionClosed:
        pass
    except Exception as e:
        print(f"WebSocket Error: {e}")
    finally:
        # Cleanup
        if websocket == state.host_ws:
            print("Host disconnected")
            state.host_ws = None
        else:
            to_remove = None
            for pid, ws in state.client_sockets.items():
                if ws == websocket:
                    to_remove = pid
                    break
            if to_remove:
                print(f"Player disconnected: {to_remove}")
                del state.client_sockets[to_remove]
                await notify_host({'type': 'player_disconnected', 'id': to_remove})

async def start_ws():
    print(f"WebSocket Server running on ws://{get_local_ip()}:{WS_PORT}")
    async with websockets.serve(handler, "0.0.0.0", WS_PORT):
        await asyncio.Future()  # run forever

def start_http():
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    Handler = http.server.SimpleHTTPRequestHandler
    # Use allow_reuse_address to avoid "Address already in use" errors
    class ReuseTCPServer(socketserver.TCPServer):
        allow_reuse_address = True
        
    with ReuseTCPServer(("0.0.0.0", HTTP_PORT), Handler) as httpd:
        print(f"HTTP Server running at http://{get_local_ip()}:{HTTP_PORT}")
        httpd.serve_forever()

if __name__ == "__main__":
    print("Starting servers...")
    # Start HTTP server in a separate thread
    http_thread = threading.Thread(target=start_http, daemon=True)
    http_thread.start()
    
    # Start WebSocket server on main thread
    try:
        asyncio.run(start_ws())
    except KeyboardInterrupt:
        print("\nServers stopped.")
