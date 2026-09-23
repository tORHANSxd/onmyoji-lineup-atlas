"""Private stdin/stdout JSON bridge, launched and owned by Electron."""
import json
import sys
import threading

from session import Session


def main():
    wire = sys.stdout
    # Protocol module diagnostics are intentionally discarded by the parent.
    sys.stdout = sys.stderr
    output_lock = threading.Lock()

    def send(value):
        with output_lock:
            wire.write(json.dumps(value, ensure_ascii=True, allow_nan=False) + '\n')
            wire.flush()

    session = Session(lambda state: send({'type': 'status', 'state': state}),
                      lambda data: send({'type': 'credentials', 'data': data}))
    session.emit(session.status())
    try:
        while True:
            line = sys.stdin.buffer.readline(196609)
            if not line:
                break
            if len(line) > 196608:
                break
            request_id = None
            try:
                request = json.loads(line)
                if not isinstance(request, dict) or type(request.get('id')) is not int:
                    raise ValueError('Invalid request')
                request_id = request['id']
                action, params = request.get('action'), request.get('params', {})
                if not isinstance(action, str) or not isinstance(params, dict):
                    raise ValueError('Invalid operation')

                def done(data, error, rid=request_id):
                    send({'type': 'response', 'id': rid, 'ok': error is None,
                          'data': data if error is None else None, 'error': error})
                session.run(action, params, done)
            except Exception as exc:
                send({'type': 'response', 'id': request_id, 'ok': False,
                      'error': session.safe_error(exc)})
    finally:
        session.clear_login()


if __name__ == '__main__':
    main()
