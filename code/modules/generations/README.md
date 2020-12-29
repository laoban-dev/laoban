# A library to do topological sorting

Many things have have 'generations'. This is where 'a series of tasks have to be done before others'

For example when you have a series of software libraries that you produce,
and some use other libraries, then when you compile/pubish them (and you want to do this in parallel),
you can sort them into generations:
* gen0: those that don't depend on any others
* gen1: those that only depend on gen0
* gen2: those that only depend on gen1 or gen0
* ...

# Using the library

## GenerationFns
You need to create an instance of 
```
interface GenerationFns<G> {
    name: (g: G) => string,
    children: (g: G) => string[],
    errorMessage: (view: GenerationView) => Error
}
```
All the sorting is done by names (for speed as much as anything) so each G has to have a unique name

## Sorting

A reasonably common use case is when we have a list of Gs. This isn't the full list. For
example we might have 10,000 items in a todo list: some depedendant on each other. We are
only going to topologically sort some of these, so we ignore things that aren't in the list we are sorting

There are two methods used:

```
 function calcGenerationsPromise<G>(genFns: GenerationFns<G>): (gs: G[]) => Promise<G[][]> 
 function calcGenerations<G>(genFns: GenerationFns<G>): (gs: G[]) => GenerationsResult<G> {
```
The methods with a promise can be convenient when working with heavy async code, and captures the idea that the
sort can fail (if there is a loop)



