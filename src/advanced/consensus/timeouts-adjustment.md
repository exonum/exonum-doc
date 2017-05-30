# Timeout Adjustment

**Timeout adjustment algorithm** allows to optimize the frequency of creating
blocks, in order to include the maximum number of transactions per block if  
transactions are frequent, and at the same time, to avoid creating new blocks
too often if transactions are rare.

_Round timeout_ is the time that influences the frequency of acceptance of new
blocks. The longer the round timeout, the bigger the expected acceptance time;
the shorter the round timeout, the smaller the expected acceptance time.

Creating blocks with too low timeout leads to increase in the consumption of
resources for blocks storage and (more crucial) for processing cryptographic
proofs when checking that blocks. Creating blocks with too high timeout leads to
delay increase in the applying of new transactions. Moreover, the accumulation of
unprocessed transactions can begin if their incoming traffic is too large.

Timeout adjustment is executed after each block acceptance.

## Algorithm Statement

`block_load` is the ratio of the transactions number in the block to the
maximum number of transactions in the block.

### Constants

- `ADJUSTMENT_SPEED` determines how fast the timeout changes when the number of
  transactions per block changes;

- `MAX_TIMEOUT` is the upper bound of the possible timeout values;

- `MIN_TIMEOUT` is the lower bound of the possible timeout values;

- `OPTIMAL_BLOCK_LOAD` is the equilibrium point. If `block_load` is less than
  the `OPTIMAL_BLOCK_LOAD`, then the timeout increases. And vice versa, if
  `block_load` is greater than `OPTIMAL_BLOCK_LOAD`, then the timeout decreases;

- `TXS_BLOCK_LIMIT` is the maximum number of transactions in a block;

- `OPTIMAL_LOAD` is the number of transactions in the optimally loaded block:
  `OPTIMAL_LOAD = TXS_BLOCK_LIMIT * OPTIMAL_BLOCK_LOAD`.

### Formula

`current_load` is number of transactions in previous block;

`load_percent` indicates whether the number of transactions in the block exceeds
`OPTIMAL_LOAD`:

```Text
load_percent = current_load / OPTIMAL_LOAD;
```

`target_timeout` is the expected timeout that will be set in the system if the
current value of `block_load` remains unchanged for a long time. Plot at the
bottom of this page shows the dependency of `target_timeout` on `block_load`:

```Text
target_timeout = MAX_TIMEOUT - (MAX_TIMEOUT - previous_timeout) * load_percent,
if current_load < OPTIMAL_LOAD;
```

```Text
target_timeout = previous_timeout - (previous_timeout - MIN_TIMEOUT) *
                 (load_percent - 1) / (1 / OPTIMAL_BLOCK_LOAD - 1),
if current_load >= OPTIMAL_LOAD.
```

`previous_timeout` is previous timeout value;

next round timeout is calculated using [exponential smoothing][exponential_smoothing]:

```Text
next_timeout = target_timeout * ADJUSTMENT_SPEED + previous_timeout *
               (1 - ADJUSTMENT_SPEED),
```

### Dependency of `target_timeout` from `block_load`

**TODO** add graph

Here, the constant `OPTIMAL_BLOCK_LOAD` and the slope of [line
segments][line_segment] are chosen to enable the system operating at the point
`OPTIMAL_BLOCK_LOAD` to respond with a timeout change for both cases of sharp
increase (timeout should be decreased) and for a sharp decrease (timeout should
be increased) in `block_load`.

[exponential_smoothing]: https://en.wikipedia.org/wiki/Exponential_smoothing
[line_segment]: https://en.wikipedia.org/wiki/Line_segment
