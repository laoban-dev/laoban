# Debugging

I often find that I use 'printline debugging'. This is where we add 'console.log' lines to 
code in order to find defects.

In general it's a bad idea to leave these in production for a number of reasons: 
* They pollute console.log with noise making it hard to find real issues
* They can take time (but actually usually don't)

However when logging we often have different levels of logging. In java for example
we often have 'logging levels'. 'Error', 'Warn', 'Info' and debug, and then we have tools to
examine the logging files. 

While I don't feel the need for levels here (yet), I want the ability to 'turn on and off' 
debugging in parts of the code.

For example I might have a section of the code called 'generations' and I might want to have
logging messages that only appear when I have a problem in the 'generations' code and
want to debug it. 

# Setting up to use
I typically have an object I used for dependency inject. Say it's called context. 
I have a comma separated list of names called debugString. This
is the list of 'sections' that I want debugging enabled for

```
let contextWithDebug=addDebug(debugString, x => console.log('#', ...x))(context)
```
This context was previously some object, and now it is an object with `{debug: <the debug function>}` added

# Using
``` 
    let s = contextWithDebug.debug('generations');
    ...
    ...
    s.message(() => ['some', 'list', 'that', 'might', 'get', 'logged']
    ...
    ...
    ...s.k(() => 'about to fullfill a promise', () => <something that returns a promise>>)
```
* The first line created a javascript object that will only print to the output when the debugString contains 'generations'.
* s.message sends a message to console.log if 'generations' is in the debugString
* s.k() returns the promise returned by `<something that returns a promise>`. It logs errors in that promise as well
