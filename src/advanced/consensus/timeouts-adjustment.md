# Timeout Adjustment

**The timeout adjustment algorithm** allows to optimize the frequency of creating
blocks, in order to include the maximum number of transactions per block if
transactions are frequent, and at the same time, avoid creating new blocks
too often if transactions are rare.

The algorithm controls _the round timeout_ and adjusts it after each block acceptance.
The longer the round timeout, the bigger the expected acceptance time;
the shorter the round timeout, the smaller the expected acceptance time.

## Motivation

Creating blocks with too low timeout leads to increase in the consumption of
resources for blocks storage and (more crucial) for processing cryptographic
proofs when verifying these blocks. Creating blocks with too high timeout leads to
delays in applying incoming transactions. Moreover, unprocessed transactions
can start accumulating if their incoming traffic is too large.

## Algorithm Statement

The algorithm takes `previous_timeout`, the round timeout value used
for the previous block, and information taken from the blockchain
(such as the number of transactions in the block). Based on this information,
the algorithm calculates `next_timeout`, the round timeout value to be
used for the next block.

**Tip.** See [source code][src-timeout-adj] for more details on timeout adjustment
implementation.

### Constants

- `ADJUSTMENT_SPEED`: float in (0.0, 1.0)  
  Determines how fast the timeout changes when the number of
  transactions per block changes.
- `MAX_TIMEOUT`: non-negative integer  
  Upper bound of the possible timeout values in milliseconds.
- `MIN_TIMEOUT`: non-negative integer  
  Lower bound of the possible timeout values in milliseconds.
- `OPTIMAL_BLOCK_LOAD`: float in (0.0, 1.0)  
  The equilibrium point. If `block_load` is less than
  the `OPTIMAL_BLOCK_LOAD`, then the timeout increases. And vice versa, if
  `block_load` is greater than `OPTIMAL_BLOCK_LOAD`, then the timeout decreases.
  `OPTIMAL_BLOCK_LOAD` should be selected in accordance with the load
  profile in a particular blockchain network. Small `OPTIMAL_BLOCK_LOAD` results
  in the generation of almost empty blocks and therefore allows to cope with a
  sharp increase in the transactions flow. Large `OPTIMAL_BLOCK_LOAD` allows to
  reduce the overhead associated with the number of blocks, but makes the system
  vulnerable to increase in the number of incoming transactions.
- `TXS_BLOCK_LIMIT`: integer  
  Maximum number of transactions in a block. It is consensus algorithm
  parameter defined in [system
  configuration](../../architecture/configuration.md#genesisconsensus).
- `OPTIMAL_LOAD`: float  
  Number of transactions in the optimally loaded block:
  `OPTIMAL_LOAD = TXS_BLOCK_LIMIT * OPTIMAL_BLOCK_LOAD`.

### Auxiliary Variables

- `current_load`: integer  
  Number of transactions in previous block.
- `block_load`: float in (0.0, 1.0)  
  Ratio of the transactions number in the block to the maximum number
  of transactions in the block.
- `previous_timeout`: float  
  Previous timeout value.

### Target Timeout

`target_timeout` is the expected timeout that will be set in the system if the
current value of `block_load` remains unchanged for a long time. Plot at the
bottom of this page shows the dependency of `target_timeout` on `block_load`:

```none
target_timeout = MAX_TIMEOUT - (MAX_TIMEOUT - previous_timeout) *
                 current_load / OPTIMAL_LOAD,
if current_load < OPTIMAL_LOAD;
```

```none
target_timeout = previous_timeout - (previous_timeout - MIN_TIMEOUT) *
                 (current_load / OPTIMAL_LOAD - 1) / (1 / OPTIMAL_BLOCK_LOAD - 1),
if current_load >= OPTIMAL_LOAD.
```

#### Dependency of `target_timeout` on `block_load`

**TODO** add graph

### Calculating Next Timeout

Next round timeout is calculated using [exponential smoothing][exponential_smoothing]:

```none
next_timeout = target_timeout * ADJUSTMENT_SPEED + previous_timeout *
               (1 - ADJUSTMENT_SPEED)
```

[exponential_smoothing]: https://en.wikipedia.org/wiki/Exponential_smoothing
[line_segment]: https://en.wikipedia.org/wiki/Line_segment
[src-timeout-adj]: https://github.com/exonum/exonum-core/blob/master/exonum/src/node/timeout_adjuster.rs
