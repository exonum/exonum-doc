# Requests in Consensus Algorithm

The requests algorithm is used to obtain unknown information from nodes that
signal the presence of such information (for example, by messages sent from
heights greater than the current node height in the case of a lagging node). The
requests algorithm is an integral part of the [consensus algorithm](consensus.md).

## Assumptions and definitions

!!! note
    In the following description, +2/3 means more than two thirds of the
    validators number.

Receiving a message from the node gives us the opportunity to learn certain
information about the state of the node, if the node is not Byzantine:

### Any consensus message

- The node is at the appropriate height.
- The node has all the previous blocks.
- The node has +2/3 `Precommit` messages for each of previous blocks.

### `Prevote`

- The node has a corresponding proposal.
- The node has all transactions of this proposal.
- If the node indicated `lock_round` in the message, it has a +2/3 `Prevote`
  messages for this proposal in the specified round.

### `Precommit`

- The node has a corresponding proposal.
- The node has all transactions of this proposal.
- The node has +2/3 `Prevote` messages for this proposal in the corresponding round.

### `Connect`

- On specified `addr` (IP address + port) it is possible to address to a node
  with specified public key.

## Algorithm for sending requests

This algorithm determines the node's behavior at different stages of the
consensus algorithm if the node needs to request information from other nodes.
The following subsections describe the triggered situations that cause specific
behavior.

For each sent request, the node stores `RequestState` which includes number of
request attempts made and list of nodes that have the required information. When
the requested info is obtained, node deletes `RequestState` for the corresponding
request.

Also for each sent request the node sets timeout. The timeout is
implemented as a message to this node itself. This message is queued and
processed when it reaches its queue. Timeout deletion means deletion from the
message queue.

### Getting any consensus message from a bigger height

- Update info about the height of blockchain on the corresponding node.
- Initiate sending `RequestBlock` for the current height (height of the latest
  committed block + 1), if such a request was not sent earlier.

Everything below is applicable only if the height of the message is the same as
validator height.

### Receiving a transaction

- If this is the last transaction required to generate some `Propose`, node
  deletes the data about the corresponding `RequestTransactions` and its timeouts.

### Receiving `Propose`

- If the node requested this `Propose`, it deletes the data about the request
  and the timeout. A list of nodes that have all transactions (if it exists)
  should be copied from the `RequestState` before deletion.
- If the node does not have certain transactions from this `Propose`, it
  initiates sending `RequestTransactions` to the author of `Propose`.

### Receiving `Prevote`

- If the node does not have a corresponding `Propose`, it initiates sending
  `RequestPropose` to the author of `Prevote`.
- If the node has `Propose` but not all transactions, it initiates sending
  `RequestTransactions` to the author of `Prevote` (only for those unknown
  transactions for which the request has not yet been sent ).
- If the sender specified `lock_round`, which is greater than the stored  
  [Proof-of-Lock (PoL)](consensus-details.md#definitions), node initiates sending
  `RequestPrevotes` for the proposal to the author of `Prevote`, mentioned at the
  received locked `Prevote`.
- If the node have formed +2/3 `Prevote` messages, it deletes the data for the
  corresponding request `RequestPrevotes` and timeouts, if the node requested
  them earlier.

### Receiving `Precommit`

- If the node does not have a corresponding `Propose`, it initiates sending
  `RequestPropose` to the author of `Precommit`.
- If the node have `Propose` but not all transactions, it initiates sending
  `RequestTransactions` to the author of `Precommit`.
- If the message corresponds to a larger round than the saved PoL, the node
  initiates sending `RequestPrevotes` for this round to the author of `Precommit`.
- If the node has formed +2/3 `Precommit` messages, it deletes the data for the
  corresponding request `RequestPrecommit` and timeouts, if the node requested
  them earlier.

### Receiving `Block`

- The node requests the next block if there are validators at a height higher
  than current.
- The node updates its height after committing the block locally.

### Adding new validators

- Send the `RequestPeers` request to the known network validator. `RequestPeers`
  message is sent regularly with the timeout `peers_timeout` defined in [the global
  configuration](../../architecture/configuration.md#global-parameters).

### Transition to a new height

- Delete all information about requests and their timeouts.

### Triggering request timeout

- Delete the validator to which the request was sent from the list of nodes that
  have the requested data.
- If the list of validators having the data to be requested is empty, delete
  `RequestState`.
- Otherwise, make one more request attempt and start a new timer.

## Algorithm for requests processing

This algorithm determines the processing of different types of request messages
by the node.

The processing of responses to requests is trivial:

- If `to` value (node which should receive request) does not correspond to the
  node's key, ignore the message.
- Check the signature of the message.

### `RequestPropose`

- If the message corresponds to a height higher than the one on which the node
  is, ignore the message.
- If the node has `Propose` with the corresponding hash at the given height,
  send it.

### `RequestTransactions`

The node sends all transactions that it has from those that were requested, as
separate messages. Transactions can either be already committed or be in the
pool. If the node does not have any of the requested transactions, don't send
anything.

### `RequestPrevotes`

- If the message does not match the height at which the node is, ignore the
  message.
- Send as individual messages all the corresponding `Prevote` messages except
  those that the requestor has.

### `RequestPrecommits`

- If the message corresponds to a height higher than the one on which the node
  is, ignore the message.
- Send as individual messages all the corresponding `Precommit` messages except
  those that the requestor has (the list of validators whose `Precommit` messages
  requestor already has is part of `RequestPrecommits`).

### `RequestBlock`

- If the message corresponds to a height not less than the one on which the node
  is, ignore the message.
- Form the message `Block` from the data of the blockchain and send it to the
  requestor.

### `RequestPeers`

- Send all the saved messages `Connect` from `peers` to the author.
