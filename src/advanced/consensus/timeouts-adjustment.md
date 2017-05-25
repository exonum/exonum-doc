# Timeout Adjustment

**Timeout adjustment algorithm** allows to optimize the frequency of creating
blocks, in order to include the maximum number of transactions per block if
there are a lot of transactions, and on the other hand, to do not create new
blocks too often if there are too few transactions.

_Round timeout_ is the time that influences the frequency of acceptance of new
blocks. The bigger the round timeout, the bigger the expected acceptance time; the
smaller the round timeout, the smaller the expected acceptance time.

Creating blocks with too low timeout leads to increase in the consumption of
resources for blocks storage (even a block without transactions requires
significant amount of memory to store in the blockchain). Creating blocks with
too high timeout leads to delay increase in the applying of new transactions.

Timeout adjustment is executed after each block acceptance.

**_block_load_** is the ratio of the number of average transactions in the block
for some period of time to the maximum number of transactions in the block. If
_block_load_ is less than the specified **_optimal_block_load_**, then the
timeout increases. And vice versa, if _block_load_ is greater than
_optimal_block_load_, then the timeout decreases.

Next round timeout is calculated using [exponential smoothing][exponential_smoothing]:

```Text
next_timeout = target_timeout * adjustment_speed + previous_timeout *
               (1 - adjustment_speed),
```

where

**_adjustment_speed_** is smoothing factor. It determines how fast the timeout
changes when the number of transactions per block changes;

**_previous_timeout_** is previous timeout value;

**_target_timeout_** is the expected timeout that will be set in the system if the
current value of _block_load_ remains unchanged for a long time. The dependency
of _target_timeout_ on _block_load_ is shown below.

**TODO** add graph

```Text
target_timeout = max_timeout - (max_timeout - previous_timeout) * block_load,
if current_load < optimal_load;
```

```Text
target_timeout = previous_timeout - (previous_timeout - min_timeout) *
                 (block_load - 1) / (1 / optimal_block_load - 1),
if current_load >= optimal_load.
```

Here _optimal_block_load_ and the slope of the line segments are chosen to provide
robustness (due to the possibility to increase and decrease the round timeout)
for the system running at the _optimal_block_load_ point both for cases of sharp
increase, and for a sharp decrease in _block_load_;

**_max_timeout_** and **_min_timeout_** are respectively upper bound and lower
bound of the possible timeout values;

**_optimal_load_** is the number of transactions in the optimally loaded block:

```Text
optimal_load = txs_block_limit * optimal_block_load;
```

**_txs_block_limit_** is the maximum number of transactions in a block;

```Text
block_load = current_load / optimal_load;
```

**_current_load_** is amount of transactions in previous block.

[exponential_smoothing]: https://en.wikipedia.org/wiki/Exponential_smoothing
