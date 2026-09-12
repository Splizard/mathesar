"""
ASGI config for config project.

It exposes the ASGI callable as a module-level variable named ``application``.

For more information on this file, see
https://docs.djangoproject.com/en/3.1/howto/deployment/asgi/
"""

import os

from django.core.asgi import get_asgi_application

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.production")

django_application = get_asgi_application()


async def application(scope, receive, send):
    """
    Serve the pages and the websocket that tells them what has changed.

    Django handles everything but a websocket, which it has no notion of; a websocket goes to
    mathesar.realtime.changes. Written out here rather than brought in with Channels, which would
    be a dependency, a channel layer and a second thing to run for one socket that needs none of
    it: Postgres is already carrying the messages.

    Note that serving this needs an ASGI server -- gunicorn with a uvicorn worker, or daphne --
    rather than the WSGI one in config/wsgi.py. Run under WSGI, the pages work exactly as before
    and nothing ever connects the socket.
    """
    if scope['type'] == 'websocket':
        # Imported here so that this module can be read before Django's apps are ready.
        from mathesar.realtime.changes import changes_socket
        await changes_socket(scope, receive, send)
        return
    await django_application(scope, receive, send)
