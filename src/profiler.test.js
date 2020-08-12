import {profile, resetCounter} from "./profiler";
import { expect, test } from "@jest/globals";

/**
 * Dummy implementation for the sub-set of the Performance interface
 * (https://developer.mozilla.org/en-US/docs/Web/API/Performance) that is used by profile.
 */
const noOpPerformance = {
    mark: (name) => {
    },
    measure: (name, startMark, endMark) => {
    }
}

test('preserves behavior of empty generator', () => {

    const generator = function*() {
    };

    const iterator = profile(generator, noOpPerformance)()
    expect(iterator.next()).toStrictEqual({"value":undefined,"done":true});
});

test('preserves behavior of output only generator', () => {

    const generator = function*() {
        yield 1;
        yield 2;
        yield 3;
    };

    const iterator = profile(generator, noOpPerformance)();
    expect(iterator.next()).toStrictEqual({"value":1,"done":false});
    expect(iterator.next()).toStrictEqual({"value":2,"done":false});
    expect(iterator.next()).toStrictEqual({"value":3,"done":false});
    expect(iterator.next()).toStrictEqual({"value":undefined,"done":true});
});

test('preserves behavior when passing useless arguments to next', () => {

    const generator = function*() {
        yield 1;
        yield 2;
        yield 3;
    };

    const iterator = profile(generator, noOpPerformance)();
    expect(iterator.next(1)).toStrictEqual({"value":1,"done":false});
    expect(iterator.next(2)).toStrictEqual({"value":2,"done":false});
    expect(iterator.next(3)).toStrictEqual({"value":3,"done":false});
    expect(iterator.next(4)).toStrictEqual({"value":undefined,"done":true});
});

test('preserves behavior when return is present', () => {

    const generator = function*() {
        yield 1;
        yield 2;
        return;
        yield 3;
    };

    const iterator = profile(generator, noOpPerformance)();
    expect(iterator.next()).toStrictEqual({"value":1,"done":false});
    expect(iterator.next()).toStrictEqual({"value":2,"done":false});
    expect(iterator.next()).toStrictEqual({"value":undefined,"done":true});
});

test('preserves behavior of input output generator 1', () => {

    const generator = function*() {
        const op1 = yield;
        const op2 = yield op1 + 1;
        yield op1 + op2;
    };

    const iterator = profile(generator, noOpPerformance)();
    expect(iterator.next()).toStrictEqual({"value":undefined,"done":false});
    expect(iterator.next(1)).toStrictEqual({"value":2,"done":false});
    expect(iterator.next(2)).toStrictEqual({"value":3,"done":false});
    expect(iterator.next()).toStrictEqual({"value":undefined,"done":true});
});

test('preserves behavior of input output generator 2', () => {``
    const generator = function*() {
        let op1 = yield "foo";
        op1 *= 2;
        let op2 = yield "bar";
        op2 *= 2;
        yield op1 + op2;
        return;
    };

    const iterator = profile(generator, noOpPerformance)();
    expect(iterator.next()).toStrictEqual({"value":"foo","done":false});
    expect(iterator.next(1)).toStrictEqual({"value":"bar","done":false});
    expect(iterator.next(2)).toStrictEqual({"value":6,"done":false});
    expect(iterator.next()).toStrictEqual({"value":undefined,"done":true});
});

test('profiling works as expected', () => {``
    const generator = function*() {
        let op1 = yield "foo";
        let op2 = yield "bar";
        yield op1 + op2;
    };

    let data = []
    const performance = {
        mark: (name) => {
            data.push(`mark(${name})`);
        },
        measure: (name, startMark, endMark) => {
            data.push(`measure(${name}, ${startMark}, ${endMark})`);
        }
    }

    resetCounter();

    const iterator = profile(generator, performance)();
    expect(data.length).toBe(0);

    iterator.next();

    expect(data.length).toBe(5);
    expect(data[0]).toBe("mark(gen0-start)");
    expect(data[1]).toBe("mark(gen0-next0-start)");
    expect(data[2]).toBe("mark(gen0-next0-end)");
    expect(data[3]).toBe("measure(generator(#0).next(#0), gen0-next0-start, gen0-next0-end)");
    expect(data[4]).toBe("mark(gen0-next1-start)");

    iterator.next();

    expect(data.length).toBe(8);
    expect(data[5]).toBe("mark(gen0-next1-end)");
    expect(data[6]).toBe("measure(generator(#0).next(#1), gen0-next1-start, gen0-next1-end)");
    expect(data[7]).toBe("mark(gen0-next2-start)");

    iterator.next();

    expect(data.length).toBe(11);
    expect(data[8]).toBe("mark(gen0-next2-end)");
    expect(data[9]).toBe("measure(generator(#0).next(#2), gen0-next2-start, gen0-next2-end)");
    expect(data[10]).toBe("mark(gen0-next3-start)");

    iterator.next();

    expect(data.length).toBe(15);
    expect(data[11]).toBe("mark(gen0-next3-end)");
    expect(data[12]).toBe("measure(generator(#0).next(#3), gen0-next3-start, gen0-next3-end)");
    expect(data[13]).toBe("mark(gen0-end)");
    expect(data[14]).toBe("measure(generator(#0), gen0-start, gen0-end)");

    iterator.next();

    expect(data.length).toBe(15);
});

test('profiling multiple generators in parallel', () => {``
    const generator = function*() {
        yield;
    };

    let data = []
    const performance = {
        mark: (name) => {
            data.push(`mark(${name})`);
        },
        measure: (name, startMark, endMark) => {
            data.push(`measure(${name}, ${startMark}, ${endMark})`);
        }
    }

    resetCounter();

    const iterator1 = profile(generator, performance)();
    const iterator2 = profile(generator, performance)();
    expect(data.length).toBe(0);

    iterator1.next();

    expect(data.length).toBe(5);
    expect(data[0]).toBe("mark(gen0-start)");
    expect(data[1]).toBe("mark(gen0-next0-start)");
    expect(data[2]).toBe("mark(gen0-next0-end)");
    expect(data[3]).toBe("measure(generator(#0).next(#0), gen0-next0-start, gen0-next0-end)");
    expect(data[4]).toBe("mark(gen0-next1-start)");

    iterator2.next();

    expect(data.length).toBe(10);
    expect(data[5]).toBe("mark(gen1-start)");
    expect(data[6]).toBe("mark(gen1-next0-start)");
    expect(data[7]).toBe("mark(gen1-next0-end)");
    expect(data[8]).toBe("measure(generator(#1).next(#0), gen1-next0-start, gen1-next0-end)");
    expect(data[9]).toBe("mark(gen1-next1-start)");

    iterator1.next();

    expect(data.length).toBe(14);
    expect(data[10]).toBe("mark(gen0-next1-end)");
    expect(data[11]).toBe("measure(generator(#0).next(#1), gen0-next1-start, gen0-next1-end)");
    expect(data[12]).toBe("mark(gen0-end)");
    expect(data[13]).toBe("measure(generator(#0), gen0-start, gen0-end)");

    iterator2.next();

    expect(data.length).toBe(18);
    expect(data[14]).toBe("mark(gen1-next1-end)");
    expect(data[15]).toBe("measure(generator(#1).next(#1), gen1-next1-start, gen1-next1-end)");
    expect(data[16]).toBe("mark(gen1-end)");
    expect(data[17]).toBe("measure(generator(#1), gen1-start, gen1-end)");

    iterator1.next();
    expect(data.length).toBe(18);

    iterator2.next();
    expect(data.length).toBe(18);
});