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

**_block_load_** is the ratio of the number of average transactions in the block
for some period of time to the maximum number of transactions in the block.

Constants used:

- `ADJUSTMENT_SPEED` determines how fast the timeout changes when the number of
  transactions per block changes;

- `MAX_TIMEOUT` is the upper bound of the possible timeout values;

- `MIN_TIMEOUT` is the lower bound of the possible timeout values;

- `OPTIMAL_BLOCK_LOAD` is the equilibrium point. If _block_load_ is less than
  the **_OPTIMAL_BLOCK_LOAD_**, then the timeout increases. And vice versa, if
  _block_load_ is greater than _OPTIMAL_BLOCK_LOAD_, then the timeout decreases.

- `TXS_BLOCK_LIMIT` is the maximum number of transactions in a block.

Next round timeout is calculated using [exponential smoothing][exponential_smoothing]:

```Text
next_timeout = target_timeout * ADJUSTMENT_SPEED + previous_timeout *
               (1 - ADJUSTMENT_SPEED),
```

where

**_previous_timeout_** is previous timeout value;

**_target_timeout_** is the expected timeout that will be set in the system if the
current value of _block_load_ remains unchanged for a long time. Plot at the
bottom of this page shows the dependency of _target_timeout_ on _block_load_.

```Text
target_timeout = MAX_TIMEOUT - (MAX_TIMEOUT - previous_timeout) * block_load,
if current_load < optimal_load;
```

```Text
target_timeout = previous_timeout - (previous_timeout - MIN_TIMEOUT) *
                 (block_load - 1) / (1 / OPTIMAL_BLOCK_LOAD - 1),
if current_load >= optimal_load.
```

Here _OPTIMAL_BLOCK_LOAD_ and the slope of the line segments are chosen to provide
robustness (due to the possibility to increase and decrease the round timeout)
for the system running at the _OPTIMAL_BLOCK_LOAD_ point both for cases of sharp
increase, and for a sharp decrease in _block_load_;

**_optimal_load_** is the number of transactions in the optimally loaded block:

```Text
optimal_load = TXS_BLOCK_LIMIT * OPTIMAL_BLOCK_LOAD;
```

```Text
block_load = current_load / optimal_load;
```

**_current_load_** is amount of transactions in previous block.

**TODO** add graph

[exponential_smoothing]: https://en.wikipedia.org/wiki/Exponential_smoothing
