# System Configuration

**_System Configuration_** is a set of settings that determine the access
network parameters of a node and the behavior of the node while operating in the
network.

## Configuration parameters

System configuration should contain configuration parameters of following types:

1. **Common parameters** must be identical for all nodes.
2. **Personal parameters** may be tweaked for each node.
3. **Parameters used by services**.

### Common parameters

- **_listen_address_** - address to be listened by this node;

- **_peers_** - list of known peers;

- **_public_key_** - node's public key (hex) for the current configuration;

- **_secret_key_** - node's private key (hex) for the current configuration.

**[network]** section - tuning TCP settings:

- **_max_incoming_connections_** - maximum number of incoming connections;

- **_max_outgoing_connections_** - maximum number of outgoing connections;

- **_tcp_nodelay_** - activation of the NODELAY algorithm from the TCP stack;

- **_tcp_reconnect_timeout_** - timeout for the first attempt to reconnect;

- **_tcp_reconnect_timeout_max_** - maximum timeout for reconnect attempt.

### Personal parameters

**[genesis]** section - the configuration used to create a genesis block (this
  parameters must be identical for all nodes):

- **_validators_** - list of validators' public keys.

**[genesis.consensus]** subsection - consensus parameters:

- **_peers_timeout_** - peer exchange timeout;

- **_propose_timeout_** - proposal timeout after the new height beginning;

- **_round_timeout_** - duration of the round;

- **_status_timeout_** - period of sending _Status_ message;

- **_txs_block_limit_** - maximum number of transactions per block.

### Parameters used by services

**Anchoring service**:

- _Remote Procedure Call_ parameters;

- bitcoin network status check _frequency_.

## Configuration file example

```
listen_address = "127.0.0.1:2000"
peers = ["127.0.0.1:2000"]
public_key = "99ace6c721db293b0ed5b487e6d6111f22a8c55d2a1b7606b6fa6e6c29671aa1"
secret_key = "e319e88128e4e3588ae3c01d80de95a40082f5bc4fa899cf5401fee033a9b78399ace6c721db293b0ed5b487e6d6111f22a8c55d2a1b7606b6fa6e6c29671aa1"

[genesis]
validators = ["99ace6c721db293b0ed5b487e6d6111f22a8c55d2a1b7606b6fa6e6c29671aa1"]

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

## Changing configuration

1. **Common parameters** may be changed by **_Global variables updater
service_** for all nodes simultaneously.
2. **Personal parameters** may be changed by editing **_configuration file_**
and restarting the node to apply changes.
