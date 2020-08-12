# ES6-Generator-Profiler

Simple wrapper that uses the [User Timing API](https://developer.mozilla.org/en-US/docs/Web/API/User_Timing_API) to profile the execution of [ES6 generator functions](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/function*).

## What problem does it solve?

I wrote `profile` to help me analyze [React](https://reactjs.org) apps that use [Redux](https://redux.js.org) and [Redux Saga](https://redux-saga.js.org). However, `profile` is strictly framework agnostic. It can be used to profile arbitrary generator functions.

Let's get started by revisiting the idea behind Sagas:
> The mental model is that a saga is like a separate thread in your application that's solely responsible for side effects.
> - https://redux-saga.js.org

Unfortunately, the above analogy does not apply at runtime: Sagas are chopped into bits and pieces that appear as unrelated Microtasks scattered throughout the timeline:
 
![timeline without profiling](images/introduction-profiling-disabled.png?raw=true)

You see the individual bits and pieces, but it's not obvious how that relates to your Sagas.
This is in stark contract to languages where Threads are *first class citizens*. For example, the following screenshot shows how threads appear as continuous bars within [VisualVM](https://visualvm.github.io) when profiing a JVM based application:

![VisualVM](images/visualvm.png?raw=true)

In the above picture, you see exactly which thread is running when.
The purpose of `profile` is to unify the mental model of a Saga with the way it is displayed in the timeline of a profiler: In both cases, it should appear as continuous thread of execution:

![timeline without profiling](images/introduction-profiling-enabled.png?raw=true)

## Alternatives

Certain lifecycle events can be captured using a custom [Redux Middleware](https://redux.js.org/advanced/middleware) or [SagaMonitor](https://redux-saga.js.org/docs/api/#sagamonitor). However, I was not able to utilize those tools to mimick how threads are displayed in JVM based profiling tools. Those extension points are nevertheless valuable to generate further insights. See [clarkbw's gist](https://gist.github.com/clarkbw/966732806e7a38f5b49fd770c62a6099) for a great example how to use a custom Redux Middleware to surface Redux actions within the profiling timeline.

## Details

Let's start our in-depth discussion of `profile` with an example:
```
function* saga1(action) {
    yield call(slowFunction);
    yield new Promise(resolve => setTimeout(resolve, 300));
    yield call(slowFunction);
    yield new Promise(resolve => setTimeout(resolve, 300));
    yield call(slowFunction;
}

function* rootSaga() {
    yield takeLatest(PATTERN1, saga1);
}
```

Let's analyze what happens at runtime using Chrome's Performance profiler:

![Profiling disabled](images/ex01-profiling-disabled.png?raw=true)

The call stacks in the Main section are mostly made up of *synthetic noise*. They provide little to no value if you want to understand which part of your application invoked `slowFunction`. You can infer from the synthetic stack frames that `slowFunction` is invoked from a Redux middleware, but that's about it. Sagas are invisible and it's not obvious that the three call stacks are siblings that share the same logical parent.

This is where `profile` comes into play:
```
function* rootSaga() {
    yield takeLatest(PATTERN1, profile(saga1, performance));
}
```

`profile` takes two arguments: A generator function and the [User Timing API](https://developer.mozilla.org/en-US/docs/Web/API/User_Timing_API). It returns a functionally equivalent generator function that emits timing information.

Let's use the profiler again, this time with our Saga wrapped inside the `profile` function:

![Profiling enabled](images/ex01-profiling-enabled.png?raw=true)

This time, we get way more high-level information that helps to connect the dots between call stacks in the Main section and application code.

Let's break down what we see:

![saga1(#1)](images/ex01-profiling-enabled-saga1.png?raw=true)

The bar `saga1(#1)` indicates that `saga1` is running during this time. `#1` indicates that this is the second time `saga1` has been executed (indices are 0-based). There is no bar `saga1(#0)` because I started profiling just before the second execution of `saga1`.  

A generator function is considered *running* from the first time `next()` is invoked to the time `next()` returns for the first time with `done: true`. Example:
```
const generator = function*() {
    yield 1;
    yield 2;
    yield 3;
};
// not running
const iterator = generator();
// not running
iterator.next(); // running even if next() has not returned yet
// running
iterator.next();
// running
iterator.next();
// not running

```
The bar for the generator will only be visible if a pervious call of `next()` returned with `done: true`. Otherwise, the Timing section will only show the sections for `next(#n)` blocks (see below).

The next image shows that the execution of `saga(#1)` is further subdivided into multiple `saga(#1).next(...)` bars:

![saga1(#1).next(#1)](images/ex01-profiling-enabled-saga1-next1.png?raw=true)

The meaning of `next(#n)`:
- n=0: interval from the first call of `next()` to the next `yield` statment returning control back to the caller
- n>0: interval from the previous `yield` statement returning control back to the caller to the next `yield` statment returning control back to the *caller*

Let's take a look at an example:
```
1 function* saga1(action) {
2    yield call(slowFunction);
3    yield new Promise(resolve => setTimeout(resolve, 300));
4    yield call(slowFunction);
5    yield new Promise(resolve => setTimeout(resolve, 300));
6    yield call(slowFunction;
7 }
```

`next(#0)` measures the time from the first call of `next()` until `yield` line 2 returns control back to the *caller*. Since control is returned back to the caller almost immediately, we have to zoom in to see the `saga1(#1).next(#0)` bar:

![saga1(#1).next(#0)](images/ex01-profiling-enabled-saga1-next0.png?raw=true)

`next(#1)` measures the time from `yield` in line 2 returning control back to the caller to `yield` in line 3 returning control back to the caller:

![saga1(#1).next(#1)](images/ex01-profiling-enabled-saga1-next1.png?raw=true)

The `call(slowFunction)` effect instructs the Saga middleware to invoke `slowFunction`. The middleware will call `slowFunction` and resume `saga1` with the result. Since `next(#1)` measures the time from `yield` returning control back to the caller in line 2 and `yield` returning control back to the caller in line 3, the timing will covers both the call to `slowFunction` as well as the creation of the Promise in line 3. It is now easy to connect the dots between `yield call(slowFunction)` line 2 of `saga1` and the call stack you can see in the Main section below `saga1(#1).next(#1)`. While it's not conclusive evidence that the call stack is related to line 2 and 3 of `saga1`, it is a great starting point for your analysis.

`next(#2)` measures the time from `yield` in line 3 returning control back to the caller to `yield` in line 4 returning control back to the caller:

![saga1(#1).next(#1)](images/ex01-profiling-enabled-saga1-next2.png?raw=true)

The time between `yield` in line 3 returning control back to the caller to `yield` in line 3 returning control back to the caller spans roughly 300 milliseconds. This is the time it takes the middleware to wait for `new Promise(resolve => setTimeout(resolve, 300));` to resolve.

