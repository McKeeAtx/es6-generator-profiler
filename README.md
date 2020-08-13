# ES6-Generator-Profiler

Simple wrapper that uses the [User Timing API](https://developer.mozilla.org/en-US/docs/Web/API/User_Timing_API) to profile the execution of [ES6 generator functions](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/function*).

## What problem does it solve?

I wrote `profile` to help analyze [React](https://reactjs.org) applications that use [Redux](https://redux.js.org) and [Redux Saga](https://redux-saga.js.org). However, `profile` is framework agnostic. It can be used to profile the execution of arbitrary generator functions.

Let's get started by revisiting the [idea behind Sagas](https://redux-saga.js.org):
> The mental model is that a saga is like a separate thread in your application that's solely responsible for side effects.

Unfortunately, the above analogy does not apply at runtime: Sagas are chopped into bits and pieces that appear as unrelated Microtasks scattered throughout the timeline:
 
![timeline without profiling](images/introduction-profiling-disabled.png?raw=true)

You see scattered call stacks, but there is no visibility into the execution of Sagas. This is in stark contract to languages where Threads are *first class citizens*. The following screenshot shows threads being displayed as continuous bars when profiling a JVM with [VisualVM](https://visualvm.github.io):

![VisualVM](images/visualvm.png?raw=true)

At any given time, it's crystal clear which threads are running. The purpose of `profile` is to provide a similar profiling experience: The profiling view should closely reflect the mental execution model that you have in your head:

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

A generator function is considered *running* from the first time `next()` is invoked to the time `next()` returns for the first time with `done: true`. Due to limitations of the implementation of `profile`, the bar for a generator will only be visible if a pervious call of `next()` returned with `done: true`. Otherwise, the Timing section will only show invocations of `next(#n)`.

The next image shows that the execution of `saga1(#1)` is broken down into smaller `saga1(#1).next(#n)` bars:

![saga1(#1).next(#1)](images/ex01-profiling-enabled-saga1-next1.png?raw=true)

The meaning of `next(#n)`:
- n=0: duration of the first invocation of `next()`
- n>0: duration from the return of the *n-1st* call of `next()` to the return of *n-th* call of `next()`

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

According to the rules introduced above, `next(#0)` measures the duration of the first invocation of `next()`. The only thing that happens during this time is the creation of the `call(slowFunction)` effect. Since the creation of the effect does not take a lot of time, we have to zoom into the timeline to see the `saga1(#1).next(#0)` bar:

![saga1(#1).next(#0)](images/ex01-profiling-enabled-saga1-next0.png?raw=true)

`next(#1)` measures the duration from the return of the first call of `next()` to the return of the second call of `next()`:

![saga1(#1).next(#1)](images/ex01-profiling-enabled-saga1-next1.png?raw=true)

Let's think about what happens during this time:
- the Redux middleware receives the `call(slowFunction)` effect
- the Redux middleware invokes `slowFunction` and resumes `saga1`
- `saga1` creates `new Promise(resolve => setTimeout(resolve, 300))` and returns it to the middleware

This suggests that the call stack below `saga1(#1).next(#1)` is related to the execution of `slowFunction`. While it's not conclusive evidence, it is a great starting point for your analysis.

`next(#2)` measures the duration from the return of the second call of `next()` to the return of the third call of `next()`:

![saga1(#1).next(#1)](images/ex01-profiling-enabled-saga1-next12.png?raw=true)

Let's again think about what happens during this time:
- the Redux middleware receives the `Promise` and waits for it to resolve
- the Recux middleware resumes `saga1`
- `saga` creates a `call(slowFunction)` effect and returns it to the middleware

This suggests that the call stack below `saga1(#1).next(#2)` is related to the middleware waiting for the `Promise` to resolve.

I hope this provides you with enough context to make sense of the other bars yourself.
