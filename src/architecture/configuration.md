# System Configuration

**_System Configuration_** is a set of settings that determine the access
network parameters of a node and the behavior of the node while operating in the
network.

Configuration is stored in [TOML][toml] format.

Configuration may be changed using **_Global variables updater service_** or by
editing configuration file (see [below](#changing-configuration) for details).

## Configuration parameters

System configuration should contain configuration parameters of following types:

1. **Global parameters** must be identical for all nodes.
2. **Local parameters** may be tweaked for each node.

### Global parameters

**[genesis]** section - the configuration used to create a genesis block (this
  parameters must be identical for all nodes):

- **_validators_** - list of validators' public keys as hex strings.

**[genesis.consensus]** subsection - consensus parameters:

- **_peers_timeout_** - peer exchange timeout (ms);

- **_propose_timeout_** - proposal timeout (ms) after the new height beginning;

- **_round_timeout_** - interval (ms) between rounds;

- **_status_timeout_** - period (ms) of sending _Status_ message;

- **_txs_block_limit_** - maximum number of transactions per block.

### Local parameters

- **_listen_address_** - address to be listened by this node;

- **_peers_** - list of known peers;

- **_public_key_** - node's public key (hex) for the current configuration;

- **_secret_key_** - node's private key (hex) for the current configuration.

**[network]** section - tuning connection settings:

- **_max_incoming_connections_** - maximum number of incoming connections;

- **_max_outgoing_connections_** - maximum number of outgoing connections;

- **_tcp_nodelay_** - activation of the NODELAY algorithm from the TCP stack
(see [RFC2126][rfc2126]);

- **_tcp_reconnect_timeout_** - timeout (ms) for the first attempt to reconnect;

- **_tcp_reconnect_timeout_max_** - maximum timeout (ms) for reconnect attempt.

## Changing configuration

1. **Global parameters** should be changed **_Global variables updater
service_** for all nodes simultaneously. If the global variables are changed by
simply editing the configuration file of node not having a database, a node will
treat the rest network's blocks as invalid.
2. **Local parameters** may be changed by editing **_configuration file_**
and restarting the node to apply changes. So that the node retained its
functionality when changing keys, you also need to update the list of validator
keys using **_Global variables updater service_**.

## Configuration file example

```
listen_address = "127.0.0.1:2000"
peers = ["127.0.0.1:2000", "127.0.0.1:2001", "127.0.0.1:2002", "127.0.0.1:2003"]
public_key = "99ace6c721db293b0ed5b487e6d6111f22a8c55d2a1b7606b6fa6e6c29671aa1"
secret_key = "e319e88128e4e3588ae3c01d80de95a40082f5bc4fa899cf5401fee033a9b78399ace6c721db293b0ed5b487e6d6111f22a8c55d2a1b7606b6fa6e6c29671aa1"

[genesis]
validators = ["99ace6c721db293b0ed5b487e6d6111f22a8c55d2a1b7606b6fa6e6c29671aa1",
"a32464be9bef16a6186a7f29d5ebc3223346faab91ea10cc00e68ba26322a1b0",
"c3f5730d81402e7453df97df2895884e0c49b5cf5ff54737c3dd28dc6537b3fd",
"f542cdc91f73747ecc20076962a2ed91749b8e0af66693ba6f67dd92f99b1533"]

[genesis.consensus]
peers_timeout = 10000
propose_timeout = 500
round_timeout = 3000
status_timeout = 5000
txs_block_limit = 1000

[network]
max_incoming_connections = 128
max_outgoing_connections = 128
tcp_nodelay = false
tcp_reconnect_timeout = 500
tcp_reconnect_timeout_max = 600000
```

[toml]: https://en.wikipedia.org/wiki/TOML
[rfc2126]: https://tools.ietf.org/html/rfc2126
