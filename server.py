import os
import json
import socket
from aiohttp import web

# Get port from environment variables or default to 8000
PORT = int(os.environ.get('PORT', 8000))

def get_local_ip():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(('10.255.255.255', 1))
        IP = s.getsockname()[0]
    except Exception:
        IP = '127.0.0.1'
    finally:
        s.close()
    return IP

class GameState:
    def __init__(self):
        self.host_sockets = [] # List of host websockets
        self.client_sockets = {} # {id: ws}

state = GameState()

async def broadcast_to_clients(message):
    for ws in list(state.client_sockets.values()):
        try:
            await ws.send_json(message)
        except Exception:
            pass

async def notify_host(message):
    for ws in list(state.host_sockets):
        try:
            await ws.send_json(message)
        except Exception as e:
            print(f"Error notifying host: {e}")

async def websocket_handler(request):
    ws = web.WebSocketResponse()
    await ws.prepare(request)
    
    try:
        async for msg in ws:
            if msg.type == web.WSMsgType.TEXT:
                data = json.loads(msg.data)
                action = data.get('action')
                
                if action == 'register_host':
                    print("Host registered")
                    if ws not in state.host_sockets:
                        state.host_sockets.append(ws)
                    await ws.send_json({
                        'type': 'host_registered',
                        'ip': get_local_ip(),
                        'port': PORT
                    })
                    
                elif action == 'join_game':
                    player_id = data.get('id')
                    name = data.get('name')
                    print(f"Player joined: {name} ({player_id})")
                    state.client_sockets[player_id] = ws
                    await notify_host({'type': 'player_joined', 'id': player_id, 'name': name})
                    await ws.send_json({'type': 'joined', 'id': player_id})
                    
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
                    target_id = data.get('target_id')
                    ui_state = data.get('ui_state')
                    payload = data.get('payload', {})
                    
                    response_msg = {'type': 'ui_update', 'state': ui_state, 'payload': payload}
                    
                    if target_id == 'all':
                        await broadcast_to_clients(response_msg)
                    elif target_id in state.client_sockets:
                        target_ws = state.client_sockets[target_id]
                        try:
                            await target_ws.send_json(response_msg)
                        except Exception as e:
                            print(f"Error sending to client {target_id}: {e}")
            elif msg.type == web.WSMsgType.ERROR:
                print('WebSocket connection closed with exception %s' % ws.exception())
    finally:
        # Cleanup
        if ws in state.host_sockets:
            print("Host disconnected")
            state.host_sockets.remove(ws)
        else:
            to_remove = None
            for pid, client_ws in state.client_sockets.items():
                if client_ws == ws:
                    to_remove = pid
                    break
            if to_remove:
                print(f"Player disconnected: {to_remove}")
                del state.client_sockets[to_remove]
                await notify_host({'type': 'player_disconnected', 'id': to_remove})

    return ws

async def index_handler(request):
    return web.FileResponse('./index.html')

def init_app():
    app = web.Application()
    # Route WebSocket
    app.router.add_get('/ws', websocket_handler)
    # Route Index specifically
    app.router.add_get('/', index_handler)
    # Serve all other static files
    app.router.add_static('/', './', name='static')
    return app

if __name__ == '__main__':
    app = init_app()
    print(f"Starting unified server on http://{get_local_ip()}:{PORT}")
    web.run_app(app, host='0.0.0.0', port=PORT)
