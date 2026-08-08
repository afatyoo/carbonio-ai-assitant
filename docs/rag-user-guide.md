# Manage AI Sources

Private AI sources are disabled by default for every user.

1. Open Carbonio Settings, then AI Assistant.
2. In **Manage AI Sources**, enable only the modules you want the assistant to search.
3. Select **Sync now** for each enabled source. Collection uses your current Carbonio session.
4. Wait until the source status becomes **Ready**. The page shows indexed document and chunk
   counts without showing private content.
5. Ask the assistant a question. Private answers include numbered source links.
6. Select **Remove** to block retrieval immediately and delete that source's index.

Enabling all supported sources is explicit opt-in. Files/Docs or Chats may appear unavailable
when the installed Carbonio version does not expose a compatible official user-scoped API.
The AI administrator cannot opt a user into private indexing or browse a user's indexed text.

For confidential deployments, configure an allowlisted self-hosted embedding endpoint. The
default local vector mode keeps content on the Carbonio host but has lower semantic quality.
