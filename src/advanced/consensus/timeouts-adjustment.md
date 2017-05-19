# Timeout Adjustment

_Round timeout_ is the time that determines the frequency of acceptance of new
blocks. Creating blocks with too low timeout leads to increase in the
consumption of resources for blocks storage. Creating blocks with too high
timeout leads to delay increase in the applying of transactions. **Timeout
adjustment algorithm** allows to optimize the frequency of creating blocks, in
order to include the maximum number of transactions per block if there are a
lot of transactions, and on the other hand, to do not create new blocks too
often if there are too few transactions.

Timeout adjustment is executed after each block acceptance.

**_Block load_** is the ratio of the number of average transactions in the block
for some period of time to the maximum number of transactions in the block. If
**_block load_** is less than the specified **_optimal_block_load_**, then the
timeout increases. And vice versa, if **_block load_** is greater than
**_optimal_block_load_**, then the timeout decreases.

**TODO** add formula
**TODO** add graph
