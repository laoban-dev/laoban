# A library to do topological sorting

Many things have have 'generations'. This is where 'a series of tasks have to be done before others'

For example when you have a series of software libraries that you produce,
and some use other libraries, then when you compile/pubish them (and you want to do this in parallel),
you can sort them into generations:
* gen0: those that don't depend on any others
* gen1: those that only depend on gen0
* gen2: those that only depend on gen1 or gen0
* ...

