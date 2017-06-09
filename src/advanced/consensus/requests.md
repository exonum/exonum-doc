# Requests in Consensus Algorithm

The requests algorithm is used to obtain unknown information from nodes that
signal the presence of such information (for example, messages are sent from
heights greater than the current node height in the case of a lagging node). The
requests algorithm is an integral part of the [consensus algorithm](consensus.md).

## Assumptions and definitions

!!! note
    In the following description, +2/3 means more than two thirds of the
    validators number.

Receiving a message from the node gives us the opportunity to learn certain
information about the state of the node, if the node is not Byzantine:

### Any consensus message

- The node is at the appropriate height, it has all the previous blocks, +2/3
  `precommit` for each of them.

### `prevote`

- The node has a corresponding proposal.
- The node has `all` transactions of this proposal.
- If the node indicated `lock_round` in the message, it has a +2/3 `prevote` for
  this proposal in the specified round.

### `precommit`

- The node has a corresponding proposal.
- The node has `all` transactions of this proposal.
- The node has +2/3 `prevote` for this proposal in the corresponding round.

### `connect`

- On specified `addr` it is possible to address to a node with specified
  `pub_key`.

## Algorithm for sending requests

This algorithm determines the node's behavior at different stages of the
consensus algorithm if the node needs to request information from other nodes.

For each sent request, the node stores `RequestState` which includes number of
request attempts made and list of nodes that have the required information. When
the requested info is obtained, node deletes `RequestState` for the corresponding
request.

### Getting any consensus message from a bigger height

- Update info about the height of blockchain in the corresponding node.
- Initiate sending `RequestBlock` for the current height, if such a request was
  not sent earlier.

Everything below is applicable only if the height of the message is the same as
validator height.

### Receiving a transaction

- If this is the last transaction required to generate some `propose`, node
  deletes the data about the corresponding request and its timeouts.

For any message from the current height:

### `propose` receiving

- If the node requested this `propose`, it deletes the data about the request
  and the timeout.
- If the node does not have certain transactions from this `propose`, it
  initiates sending `RequestTransactions`.
- A list of nodes that have all transactions should be copied from the deleted
  `RequestState` for `RequestPropose`, if it existed.

### `prevote` receiving

- If the node does not have a corresponding `propose`, it initiates sending
  `RequestPropose`.
- If the node has `propose` but not all transactions, it initiates sending
  `RequestTransaction` (only for those unknown transactions for which the request
  has not yet been sent ).
- If the sender specified `lock_round`, which is greater than the stored PoL,
  node initiates sending `RequestPrevotes`.
- If the node have formed +2/3 `prevote`, it deletes the data for the
  corresponding request `RequestPrevotes` and timeouts, if the node requested
  them earlier.

### `precommit` receiving

- If the node does not have a corresponding `propose`, it initiates sending
  `RequestPropose`.
- If the node have `propose` but not all transactions, it initiates sending
  `RequestTransaction`.
- If the message corresponds to a larger round than the saved PoL, the node
  initiates sending `RequestPrevotes` for this round.
- If the node has formed +2/3 `precommit`, it deletes the data for the
  corresponding request `RequestPrecommit` and timeouts, if the node requested
  them earlier.

### `block` receiving

- The node requests the next block if there are validators at a height higher
  than current.

### Adding new validators

- Send the `RequestPeers` request to the known network validator. `RequestPeers`
  message is sent regularly with the timeout `peers_timeout` defined in [the global
  configuration](../../architecture/configuration.md#global-parameters).

### Transition to a new height

- Delete all information about requests and their timeouts.

### Request sending initiation

- If there is no corresponding `RequestState` for the requested data, create
  it and set the timer to wait for the data (`RequesTimeout`).
- Add the node to the list of nodes that have this data.

### Triggering request timeout

- Delete the validator from the list of nodes that have the requested data.
- If the list of validators for which the requested data should be empty, delete
  `RequestState`.
- Otherwise, execute the request and start a new timer.

## Algorithm for requests processing

This algorithm determines the processing of different types of request messages
by the node.

The processing of responses to requests is trivial:

- If `to` value (node which should receive request) does not correspond to our
  key, ignore the message.
- If the message is too old (the value of the field `time` is earlier than in
  the previous `Connect` message received from the same peer), ignore the message.
- If the message indicates the future time of delivery, ignore the message.
- Check the signature of the message.

### `RequestPropose`

- If the message corresponds to a height higher than the one on which the node
  is, ignore the message.
- If the node has `propose` c with the corresponding hash at the given height,
  send it.

### `RequestTransactions`

The node sends all transactions that we have from those that were requested, as
separate messages. Transactions can either be already committed or be in the
pool. If we do not have any of the requested transactions, don't send anything.

### `RequestPrevotes`

- If the message does not match the height at which the node is, ignore the
  message.
- Send as individual messages all the corresponding `prevote` messages except
  those that the requestor has.

### `RequestPrecommits`

- If the message corresponds to a height higher than the one on which the node
  is, ignore the message.
- Send as individual messages all the corresponding `precommit` messages except
  those that the requestor has.

### `RequestBlock`

- If the message corresponds to a height not less than the one on which we are,
  ignore the message.
- Form the message `Block` from the data of the blockchain and send it to the
  requestor.

### `RequestPeers`

- Send all the saved messages `Connect` from `peers` to the author.
