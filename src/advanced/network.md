# Networking Specification

**Exonum network** consists of [full nodes](../glossary.md#full-node)
connected via peer-to-peer connections, and
[light clients](../glossary.md#light-client).
Full nodes communicate with each other using Protobuf messages
over encrypted / authenticated TCP channels, and clients interact
with full nodes via REST service interface and WebSockets.

## Network Structure

### Full Nodes

**Full nodes** store the entire contents of the blockchain. All the full nodes
are authenticated with
[public-key cryptography](../glossary.md#digital-signature).
Full nodes are further subdivided into 2 categories:

- [**Auditors**](../glossary.md#auditor) replicate the entire contents of the
  blockchain. They can generate new transactions, but cannot choose which
  transactions should be committed (i.e., cannot generate new blocks)
- [**Validators**](../glossary.md#validator) exchange consensus messages with
  each other to reach consensus and add new blocks into the blockchain.
  Validators receive transactions, verify them,
  and include into a new block. The list of the validators is restricted by
  network maintainers, and normally should consist of 4–16 nodes.

!!! note
    The operability of the network with 4-16 validators has been verified by
    our research team. See section 7.3 of our [whitepaper][whitepaper] on the
    Exonum consensus algorithm. Meanwhile, the system may operate with a
    larger number of validators.

### Light Clients

!!! tip
    See [separate article](../architecture/clients.md) for more details on
    _light clients_.

**Light clients** represent clients in the client-server paradigm; they connect
to full nodes for several purposes:

- to retrieve information they are interested in from the blockchain
- to subscribe to events like block commits and transaction commits
  and be aware of new accepted blocks and transactions
- to send transactions.

Note that this functionality may require certain services to be instantiated
on the blockchain, such as the [explorer service](other-services.md#explorer).

Exonum also provides a [“proofs mechanism”](../glossary.md#merkle-proof),
based on cryptographic commitments via Merkle / Merkle Patricia
trees. This mechanism enables light clients to verify that a response from the
full node has been really authorized by a supermajority of validators.

## Peer-to-Peer Full Node Network

Full nodes use Protobuf over TCP to communicate with each other.
All network connections are encrypted using [Noise Protocol][noise].
The Moise Protocol starts with a handshake message exchange.
The handshake includes exchange of [public keys][DH] and
[connect messages](#connect-messages) by the nodes. In order to authenticate
the  connection, the sender includes the receiver's public key into its
handshake message.

As a result of the Diffie-Hellman key agreement, the nodes receive a shared
secret key. This key is then used to send encrypted messages between these
nodes.

Noise Protocol protects Exonum against a number of potential vulnerabilities,
for example, traffic sniffing between nodes.

Messages exchanged by full nodes include consensus messages and transactions.

### Transaction Broadcasting

A node broadcasts transactions obtained via API or created by the node itself,
but does not broadcast transactions received from other nodes (via
broadcasting or [requests mechanism](consensus/requests.md)).

### Consensus Messages and Requests

Validators generate and process consensus messages as specified
by [the consensus algorithm](consensus/specification.md).
Auditor nodes are set not to receive consensus messages (`Propose`, `Prevote`,
`Precommit`) when they are broadcast by the validators.

### `Connect` Messages

On establishing a P2P connection, nodes exchange `Connect` messages
in which a node indicates its public key. The `Connect` message also contains
the public IP address or the domain name of the node.
Each node stores all received `Connect` messages in
the _list of known peers_. As soon as a handshake is reached (the `Connect`
message is received and successfully processed) from both sides, the nodes begin
to exchange messages.

#### Peer Discovery

Each node regularly sends [`PeersRequest`](consensus/requests.md#peersrequest)
to a random known node with the timeout `peers_timeout` defined in the
[global configuration](../architecture/configuration.md#genesisconsensus).
[In response](consensus/requests.md#peersrequest-1), the addressee sends its
list of known peers. Thus, it is enough to connect to one node at the start and
after some time it will be possible to collect `Connect` messages from the
entire network.

At the same time, the initial list of addresses, where other full nodes may
be specified, is defined in the [local configuration](../glossary.md#local-configuration)
 of the node (parameter `connect_list`). This list is used to discover
the initial set of peers on the node start up. If some node changes its address,
then through peer discovery mechanism a new address becomes known to
all other nodes in some time.

The addresses in the `connect_list` may be specified both as host
names and IP addresses.

## Communication with Light Clients

Light clients interact with full nodes via
[service REST API endpoints](../glossary.md#service-endpoint) and via
WebSockets. Both these kinds of interfaces are defined by the
[services](../architecture/services.md) rather than the node.
On its own, a node does not define any endpoints, although it does
provides HTTP servers used by the Rust runtime. This design leads to
greater flexibility and modularity.

Full nodes can receive transactions from light clients using
the [explorer service](other-services.md#explorer) via POST requests.
Transactions from light clients are authenticated with the help of
signatures, which are the part of JSON serialization of transactions.
Light clients can also get info from full nodes via GET endpoints
defined in specific services. These requests are generally not authenticated.

### Service Endpoints

Organization of service endpoints is dependent on the runtime.
For example, Rust services define API endpoints via
`Service::wire_api` hook. The Rust runtime provides two HTTP servers,
a *public* one and a *private* one; the endpoints for each are separate.
The idea is that public endpoints can be universally accessed, and
private endpoints could be used for more delicate tasks, such as administration.
Endpoints for a Rust service are prefixed with `/api/services/{service_name}`,
where `service_name` is a string service identifier.

!!! note
    There is no unified format for naming endpoints (e.g., passing parameters
    for GET endpoints via path components and/or query parameters).
    Thus, services need to use best practices for REST APIs.

!!! note
    For historic reasons, the explorer service endpoints have
    `/api/explorer` prefix.

[whitepaper]: https://bitfury.com/content/downloads/wp_consensus_181227.pdf
[noise]: https://noiseprotocol.org/
[DH]: https://en.wikipedia.org/wiki/Diffie%E2%80%93Hellman_key_exchange
