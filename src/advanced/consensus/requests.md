# Requests in Consensus Algorithm

The requests algorithm is used to obtain unknown information from nodes that
signal the presence of such information (for example, by messages sent from
heights greater than the current node height in the case of a lagging node). The
requests algorithm is an integral part of the [consensus algorithm](consensus.md).

## Assumptions and Definitions

!!! note
    In the following description, +2/3 means more than two thirds of the
    validators number. For example, +2/3 `Precommit`s means a set of valid
    `Precommit` messages, each of which is digitally signed by a different
    validator, and the size of the set is more than 2/3 of the validator number.

Receiving [a consensus message](consensus.md#messages) from a node gives the
message recepient
an opportunity to learn certain information about the state of the message
author (a node that has signed the message; the message author may differ from
the peer that the message recipient got the message from), if the author is not
Byzantine. The node saves this information in [the RequestState structure](#algorithm-for-sending-requests).

### Any Consensus Message

- The message author is at the height implied by the message
- The author has blocks corresponding to all lesser heights
- The author has +2/3 `Precommit` messages for each of previous blocks

### `Prevote`

- The author has a proposal (`Propose` message) referenced by the `Prevote` message
- The author has all transactions mentioned in this proposal
- If the author indicated `lock_round` in the message, it has a +2/3 `Prevote`
  messages for this proposal in the `locked_round` or round with lower number.

### `Precommit`

- The author has a proposal referenced by the `Precommit` message
- The author has all transactions mentioned in this proposal
- The author has +2/3 `Prevote` messages for this proposal in some round with
  number equal to or lower than the round number mentioned in the `Precommit`.

### `Connect`

- It is possible to access the author by using the IP adress + port
  mentioned in the message

## Request Messages

### Field Types

`Hash` and `PublicKey` types represent SHA-256 hashes and Ed25519 public keys
and take 32 bytes.

`u32` and `u64` are nonnegative integers of appropriate size (4 and 8 bytes).

`BitVec` is a bit vector containing as many bits as there are validators in
the system.

### `RequestPropose`

Requests a `Propose` message from a node. It has the following fields:

- **from**: PublicKey  
  Requestor's public key.
- **to**: PublicKey  
  Public key of the node to which the request was sent.
- **height**: u64  
  Height of the blochchain for which information is requested.
- **propose_hash**: Hash  
  Hash of the proposal for which information is requested.

### `RequestTransactions`

Requests transactions from a node. It has the following fields:

- **from**: PublicKey  
  Requestor's public key.
- **to**: PublicKey  
  Public key of the node to which the request was sent.
- **txs**: Array<Hash\>  
  List of requested transactions' hashes.

### `RequestPrevotes`

Requests `Prevote` messages from a node. It
has the following fields:

- **from**: PublicKey  
  Requestor's public key.
- **to**: PublicKey  
  Public key of the node to which the request was sent.
- **height**: u64  
  Blochchain height for which information is requested.
- **round**: u32  
  Round number (at the blockchain height specified in `height` field) for which
  information is requested.
- **propose_hash**: Hash  
  Hash of the proposal for which information is requested.
- **validators**: BitVec  
  Each bit of this field indicates the need to send `Prevote` message from
  the corresponding validator (if bit value is 1, `Prevote` is requested; else
  `Prevote` is not needed). Indexing of the `validators` bits corresponds to the
  indexing of validator public keys in the [actual configuration](../../architecture/configuration.md#genesis).

### `RequestBlock`

Requests a committed block from a node. It has the following fields:

- **from**: PublicKey  
  Requestor's public key.
- **to**: PublicKey  
  Public key of the node to which the request was sent.
- **height**: u64  
  Height of the blochchain for which information is requested.

### `RequestPeers`

Requests `Connect` messages from a node.
`RequestPeers` message is sent regularly with the timeout `peers_timeout`
defined in [the global configuration](../../architecture/configuration.md#global-parameters).
It has the following fields:

- **from**: PublicKey  
  Requestor's public key.
- **to**: PublicKey  
  Public key of the node to which the request was sent.

## Algorithm for Sending Requests

This algorithm determines the node's behavior at different stages of the
consensus algorithm if the node needs to request information from other nodes.
The following subsections describe events that cause a specific response.

For each sent request, the node stores a `RequestState` structure,
which includes the number of request attempts made
and a list of nodes that should have the required information.  When
the requested info is obtained, the node deletes `RequestState`
for the corresponding request (cancels request).

The node sets a timeout for each sent request. The timeout is
implemented as a message to this node itself. This message is queued and
processed when it reaches its queue. Timeout deletion (cancelling timeout) means
its deletion from the message queue.

Cancelling a request means cancelling a corresponding timeout as well.

### Receiving Transaction

If this is the last transaction required to collect a known `Propose`,
cancel the corresponding `RequestTransactions`.

### Consensus Message from Bigger Height

- Update info about the height of blockchain on the corresponding node
- Send `RequestBlock` for the current height (height of the latest
  committed block + 1) to the message author, if such a request was not sent earlier

All events below are applicable only if the height of the message is the same as
validator height.

### Receiving `Propose`

- If this `Propose` was requested, cancel the request. A list
  of nodes that should have all transactions mentioned in the `Propose` message
  is copied from the `RequestState` before its deletion to request
  missing transactions if necessary
- If certain transactions from the `Propose` are not known,
  send `RequestTransactions` to the author of `Propose`. Set the nodes in
  `RequestState` for this request as calculated on the previous step.

### Receiving `Prevote`

- If the node does not have the corresponding `Propose`, send
  `RequestPropose` to the author of `Prevote`
- If the sender specified `lock_round`, which is greater than the stored  
  [Proof-of-Lock (PoL)](consensus.md#locks), send
  `RequestPrevotes` for the locked proposal to the author of `Prevote`
- If the node have formed +2/3 `Prevote` messages for the same proposal, cancel
  the request `RequestPrevotes` for `Prevote` messages corresponding to this
  proposal (if they were requested earlier)

### Receiving `Precommit`

- If the node does not have a corresponding `Propose`, send
  `RequestPropose` to the author of `Precommit`
- If the message corresponds to a larger round than the saved PoL,
  send `RequestPrevotes` for this round to the author of `Precommit`
- If the node has formed +2/3 `Precommit` messages for the same proposal, cancel
  the corresponding `RequestPrecommit`s (if they were requested earlier)

### Receiving `Block`

- Request the next block from the node (if one exists) that sent any message
  from the height higher than current height + 1. If there are several such
  nodes, request is sent to the one from which the message from the height
  higher than current height + 1 was received earlier
- Update current height after committing the block locally
- Cancel `RequestBlock` for the height at which the block was just committed

### Peers Timeout

Send a `RequestPeers` request to a random peer (auditor or validator) from a
list of known peers specified in [local
configuration](../../architecture/configuration.md#local-parameters).

### Move to New Height

Cancel all requests.

### Request Timeout

- Delete the node, to which the request was sent, from the list of nodes that
  should have the requested data (that list is a part of the `RequestState`
  structure)
- If the list of nodes having the data to be requested is empty, cancel
  request
- Otherwise, make one more request attempt to another node from the list of
  nodes that should have the requested data and start a new timer

## Algorithm for requests processing

This algorithm determines the processing of different types of request messages
by the node.

### `RequestPropose`

- If the message corresponds to a height that isn't equal to the current height
  of the node, ignore the message
- If the node has `Propose` with the corresponding hash at the given height,
  send it

### `RequestTransactions`

Send all transactions the node has from those that were requested, as
separate messages. Transactions can either be already committed or be in the
pool of unconfirmed transactions.

### `RequestPrevotes`

- If the message does not match the height at which the node is, ignore the
  message
- Send as individual messages all the corresponding `Prevote` messages except
  those that the requestor has

### `RequestBlock`

- If the message corresponds to a height not less than that of the node,
  ignore the message
- Form the message `Block` from the blockchain data and send it to the
  requestor

### `RequestPeers`

Send all the saved `Connect` messages from peers to the requestor.
