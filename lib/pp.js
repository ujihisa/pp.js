(function() {
  var Promise, Trampoline, contexts, metaContext, old, pp, __;

  pp = {};

  old = this.pp;

  __ = {};

  metaContext = {};

  contexts = {};

  if (typeof module !== 'undefined') {
    module.exports = pp;
  } else {
    this.pp = pp;
  }

  pp.noConflict = function() {
    this.pp = old;
    return pp;
  };

  __.extend = function(init) {
    var key, props, value;
    props = typeof init === 'function' ? init.call(this) : init;
    for (key in props) {
      value = props[key];
      if (props.hasOwnProperty(key)) {
        this[key] = value;
      }
    }
    return this;
  };

  __.extend({
    keys: Object.keys || function(any) {
      var key, _results;
      _results = [];
      for (key in any) {
        _results.push(key);
      }
      return _results;
    },
    slice: Array.prototype.slice,
    isPrimitive: function(any) {
      switch (typeof any) {
        case 'undefined':
        case 'boolean':
        case 'number':
        case 'string':
          return true;
        default:
          return any === null;
      }
    },
    isArray: Array.isArray || function(any) {
      return Object.prototype.toString.call(any) === '[object Array]';
    },
    inherit: Object.create || function(any) {
      var Inherit, copied;
      copied = any;
      if (__.isPrimitive(any)) {
        return copied;
      }
      if (__.isArray(any)) {
        return any.slice();
      }
      Inherit = function() {};
      Inherit.prototype = any.prototype;
      return new Inherit();
    },
    nothing: function() {},
    id: function(x) {
      return x;
    },
    not: function(x) {
      return !x;
    },
    defer: (function() {
      var _nextTick, _nextTimeout;
      _nextTick = function(fn) {
        var args;
        if (1 < arguments.length) {
          args = __.slice.call(arguments, 1);
          process.nextTick(function() {
            fn.apply(null, args);
          });
        } else {
          process.nextTick(fn);
        }
      };
      _nextTimeout = function(fn) {
        if (1 < arguments.length) {
          setTimeout.apply(null, [fn, 0].concat(__.slice.call(arguments, 1)));
        } else {
          setTimeout(fn, 0);
        }
      };
      if (typeof process !== 'undefined' && typeof process.nextTick === 'function') {
        return _nextTick;
      } else {
        return _nextTimeout;
      }
    })(),
    error: {
      invalidArgument: function(api_name, any, message) {
        return new TypeError("" + api_name + " - Invalid Argument : " + any + "\n" + message);
      }
    }
  });

  pp.defer = __.defer;

  Trampoline = (function() {
    var TIME_SLICE, current, invoke, limitTimeSlice, procStack, register, timeStack;

    TIME_SLICE = (function() {
      var fpsRate, rate, slices, _i, _len;
      slices = {};
      fpsRate = [240, 120, 60, 30, 25, 15, 1];
      for (_i = 0, _len = fpsRate.length; _i < _len; _i++) {
        rate = fpsRate[_i];
        slices["FPS_" + rate] = Math.ceil(1000 / rate) - 1;
      }
      return slices;
    })();

    current = null;

    procStack = [];

    timeStack = [];

    invoke = (function() {
      var getTime, timeLimit, timeSlice;
      getTime = function() {
        return new Date().getTime();
      };
      timeSlice = 0;
      timeLimit = 0;
      return invoke = function() {
        if (procStack.length < 1) {
          return;
        }
        current = procStack.shift();
        timeSlice = timeStack.shift();
        timeLimit = getTime() + timeSlice;
        while (typeof current === 'function' && getTime() < timeLimit) {
          current = current();
        }
        if (typeof current === 'function') {
          procStack.push(current);
          timeStack.push(timeSlice);
        }
        __.defer(invoke);
      };
    })();

    limitTimeSlice = function(timeSlice) {
      if (typeof timeSlice !== 'number') {
        return TIME_SLICE.FPS_240;
      } else {
        return Math.max(timeSlice, TIME_SLICE.FPS_240);
      }
    };

    register = function(fn) {
      var args, proc, requireLength, timeSlice;
      requireLength = fn.length;
      if (requireLength < arguments.length) {
        timeSlice = arguments[requireLength + 1];
      }
      if (requireLength < 1) {
        proc = fn;
      } else {
        args = __.slice.call(arguments, 1, requireLength + 1);
        proc = function() {
          return fn.apply(null, args);
        };
      }
      procStack.push(proc);
      timeStack.push(limitTimeSlice(timeSlice));
      if (procStack.length === 1) {
        invoke();
      }
    };

    function Trampoline() {}

    Trampoline.prototype.TIME_SLICE = TIME_SLICE;

    Trampoline.prototype.getCurrent = function() {
      return current;
    };

    Trampoline.prototype.register = register;

    Trampoline.prototype.partial = function(fn) {
      var partialized;
      return partialized = function() {
        var args, partial;
        args = __.slice.call(arguments);
        if (fn.length > args.length) {
          return partial = function() {
            if (arguments.length < 1) {
              return partial;
            }
            return partialized.apply(null, args.concat(__.slice.call(arguments)));
          };
        } else {
          args.unshift(fn);
          return register.apply(null, args);
        }
      };
    };

    return Trampoline;

  })();

  pp.TIME_SLICE = Trampoline.prototype.TIME_SLICE;

  Promise = (function() {
    var REJECTED, RESOLVED, UNRESOULVED, fire;

    UNRESOULVED = 'unresolved';

    RESOLVED = 'resolved';

    REJECTED = 'rejected';

    fire = Trampoline.prototype.partial(function(promise, value) {
      var finish, invoke, shift;
      promise.result = value;
      invoke = function() {
        var entry, proc;
        entry = promise.stack.shift();
        proc = promise.state === REJECTED ? entry[1] : entry[0];
        if (proc) {
          try {
            promise.result = proc.call(promise.scope, promise.result);
          } catch (error) {
            promise.state = REJECTED;
            promise.result = error;
          }
        }
        return shift;
      };
      finish = function() {
        if (promise.state !== REJECTED) {
          promise.state = RESOLVED;
        }
      };
      return shift = function() {
        if (promise.stack.length < 1) {
          return finish;
        } else {
          return invoke;
        }
      };
    });

    function Promise(scope) {
      this.state = UNRESOULVED;
      this.stack = [];
      this.scope = scope || null;
    }

    Promise.prototype.STATE = {
      UNRESOULVED: UNRESOULVED,
      RESOLVED: RESOLVED,
      REJECTED: REJECTED
    };

    Promise.prototype.resolve = function(value) {
      fire(this, value);
      return this;
    };

    Promise.prototype.reject = function(value) {
      this.state = REJECTED;
      fire(this, value);
      return this;
    };

    Promise.prototype.isResolved = function() {
      return this.state === RESOLVED;
    };

    Promise.prototype.isRejected = function() {
      return this.state === REJECTED;
    };

    Promise.prototype.then = function(success, fail, progress) {
      this.stack.push([success || null, fail || null, progress || null]);
      if (this.state !== UNRESOULVED) {
        fire(this, null);
      }
      return this;
    };

    return Promise;

  })();

  pp.promise = function(scope) {
    return new Promise(scope);
  };

  metaContext.iteratorMixin = function(mixinName, arrayIterator, hashIterator) {
    var mixin;
    return mixin = function(iterator, receiver, iterable) {
      if (__.isPrimitive(iterable)) {
        receiver(__.error.invalidArgument(mixinName, iterable, 'required Array or Object as HashMap'));
        return;
      }
      if (__.isArray(iterable)) {
        return arrayIterator(iterator, receiver, iterable);
      } else {
        return hashIterator(iterator, receiver, iterable);
      }
    };
  };

  contexts.extend = function(params) {
    var name, proc;
    for (name in params) {
      proc = params[name];
      if (params.hasOwnProperty(name)) {
        this[name] = proc;
        if (!name.match(/^_/i)) {
          pp[name] = Trampoline.prototype.partial(proc);
        }
      }
    }
    return this;
  };

  pp.extend = function(contextMakers) {
    var apiName, apiProc;
    for (apiName in contextMakers) {
      apiProc = contextMakers[apiName];
      if (contextMakers.hasOwnProperty(name)) {
        contexts[name] = apiProc;
        this[api_name] = Trampoline.prototype.partial(apiProc);
      }
    }
    return this;
  };

  __.extend.call(metaContext, {
    arrayEachStepBy: function(isShouldStep) {
      var makeProc;
      return makeProc = function(iterator, callback, array) {
        var LIMIT, count, finished, index, next, proc;
        LIMIT = array.length;
        if (LIMIT < 1) {
          callback(null);
          return;
        }
        index = 0;
        count = 0;
        finished = false;
        next = function(error) {
          var args;
          ++count;
          if (!finished && (count >= LIMIT || error || arguments.length > 1)) {
            finished = true;
            args = __.slice.call(arguments, 1);
            args.unshift(error || null);
            callback.apply(null, args);
          }
        };
        return proc = function() {
          if (finished) {
            return;
          }
          if (isShouldStep(index, LIMIT, count)) {
            iterator(next, array[index], index, array);
            ++index;
          }
          return proc;
        };
      };
    },
    hashEachBy: function(eachProc) {
      var makeProc;
      return makeProc = function(iterator, callback, hash) {
        var hashIterator;
        hashIterator = function(next, key, index, keys) {
          iterator(next, hash[key], key, hash);
        };
        return eachProc(hashIterator, callback, __.keys(hash));
      };
    }
  });

  contexts.extend((function() {
    var fill, hashEach, meta, mixin, order, toLimit, waitCallback;
    toLimit = function(index, limit) {
      return index < limit;
    };
    waitCallback = function(index, limit, count) {
      return index < limit && index <= count;
    };
    meta = metaContext;
    mixin = meta.iteratorMixin;
    hashEach = meta.hashEachBy;
    fill = meta.arrayEachStepBy(toLimit);
    order = meta.arrayEachStepBy(waitCallback);
    return {
      _arrayEachFill: fill,
      _arrayEachOrder: order,
      each: mixin('pp#each', fill, hashEach(fill)),
      eachOrder: mixin('pp#eachOrder', order, hashEach(order))
    };
  })());

  __.extend.call(metaContext, {
    arrayMapBy: function(eachProc) {
      var makeProc;
      return makeProc = function(iterator, callback, array) {
        var after, mapping, modified, pushResult;
        modified = [];
        pushResult = null;
        mapping = function(next, value, index, iterable) {
          pushResult = function(error, result) {
            modified[index] = result;
            next(error);
          };
          iterator(pushResult, value, index, iterable);
        };
        after = function(error) {
          callback(error, modified);
        };
        return eachProc(mapping, after, array);
      };
    },
    hashMapBy: function(eachProc) {
      var makeProc;
      return makeProc = function(iterator, callback, hash) {
        var after, mapping, modified, putResult;
        modified = __.inherit(hash);
        putResult = null;
        mapping = function(next, key, index, keys) {
          putResult = function(error, result) {
            modified[key] = result;
            next(error);
          };
          iterator(putResult, hash[key], key, hash);
        };
        after = function(error) {
          callback(error, modified);
        };
        return eachProc(mapping, after, __.keys(hash));
      };
    }
  });

  contexts.extend((function() {
    var arrayMap, fill, hashMap, meta, mixin, order;
    meta = metaContext;
    mixin = meta.iteratorMixin;
    arrayMap = meta.arrayMapBy;
    hashMap = meta.hashMapBy;
    fill = contexts._arrayEachFill;
    order = contexts._arrayEachOrder;
    return {
      map: mixin('pp#map', arrayMap(fill), hashMap(fill)),
      mapOrder: mixin('pp#mapOrder', arrayMap(order), hashMap(order))
    };
  })());

  __.error.invalidFolding = function(apiName, target) {
    var errorMessage;
    if (!__.isArray(target)) {
      errorMessage = "require Array (Not Null) to folding, but " + (typeof target);
    } else if (target.length < 1) {
      errorMessage = 'Array length is 0, and without init value';
    } else {
      return;
    }
    return __.error.invalidArgument(apiName, target, errorMessage);
  };

  __.extend.call(metaContext, {
    foldBy: function(setIndex) {
      var folding;
      return folding = function(iterator, callback, init, array) {
        var accumulate, after, fold, memo;
        memo = init;
        accumulate = null;
        fold = function(next, value, index, iterable) {
          index = setIndex(index, iterable.length);
          accumulate = function(error, result) {
            memo = result;
            next(error);
          };
          iterator(accumulate, memo, iterable[index], index, iterable);
        };
        after = function(error) {
          callback(error, memo);
        };
        return contexts._arrayEachOrder(fold, after, array);
      };
    },
    foldOne: function(name, method, fold) {
      var folding;
      return folding = function(iterator, receiver, array) {
        var copied, error, init;
        error = __.error.invalidFolding(name, array);
        if (error) {
          receiver(error);
          return;
        }
        copied = array.slice();
        init = copied[method]();
        return fold(iterator, receiver, init, copied);
      };
    }
  });

  contexts.extend((function() {
    var foldLeft, foldOne, foldRight, meta, reverseIndex;
    reverseIndex = function(index, limit) {
      return limit - (index + 1);
    };
    meta = metaContext;
    foldOne = meta.foldOne;
    foldLeft = meta.foldBy(__.id);
    foldRight = meta.foldBy(reverseIndex);
    return {
      foldl: foldLeft,
      foldr: foldRight,
      foldl1: foldOne('pp#foldl1', 'shift', foldLeft),
      foldr1: foldOne('pp#foldr1', 'pop', foldRight)
    };
  })());

  metaContext.filter_by = function(tester) {
    var makeProc;
    return makeProc = function(iterator, callback, array) {
      var after, filter, pushMatched, stackMatched;
      stackMatched = [];
      pushMatched = null;
      filter = function(next, value, index) {
        pushMatched = function(error, result) {
          if (!error && tester(result)) {
            stackMatched.push(value);
          }
          next(error);
        };
        iterator(pushMatched, value, index, array);
      };
      after = function(error) {
        callback(error, stackMatched);
      };
      return contexts._arrayEachOrder(filter, after, array);
    };
  };

  contexts.extend({
    filter: metaContext.filter_by(__.id),
    reject: metaContext.filter_by(__.not)
  });

  metaContext.logical = function(test, wrap_callback) {
    var make_proc;
    return make_proc = function(iterator, receiver, iterable) {
      var after_check, check_iterate;
      after_check = null;
      check_iterate = function(next, value, key, iterable) {
        after_check = function(error, result) {
          if (test(result)) {
            next(error, value);
          } else {
            next(error);
          }
        };
        iterator(after_check, value, key, iterable);
      };
      return contexts.each(check_iterate, wrap_callback(receiver), iterable);
    };
  };

  contexts.extend((function() {
    var judge_by_length, logical;
    logical = metaContext.logical;
    judge_by_length = function(judge) {
      return function(receiver) {
        return function(error) {
          receiver(error, judge(arguments.length));
        };
      };
    };
    return {
      any: logical(__.id, judge_by_length(function(n) {
        return n > 1;
      })),
      all: logical(__.not, judge_by_length(function(n) {
        return n < 2;
      })),
      find: logical(__.id, __.id)
    };
  })());

  metaContext.until_by = function(check) {
    var makeProc;
    return makeProc = function(test, iterator, callback, init) {
      var finished, memo, next, proc;
      memo = __.isArray(init) ? init.slice() : [];
      finished = false;
      next = function(error) {
        if (finished) {
          return;
        }
        if (error) {
          finished = true;
          callback(error);
          return;
        }
        if (arguments.length > 1) {
          memo = __.slice.call(arguments, 1);
        }
      };
      return proc = function() {
        if (finished) {
          return;
        }
        if (check(test.apply(null, memo))) {
          finished = true;
          callback.apply(null, [null].concat(memo));
          return;
        }
        iterator.apply(null, [next].concat(memo));
        return proc;
      };
    };
  };

  contexts.extend({
    whilist: metaContext.until_by(__.not),
    until: metaContext.until_by(__.id)
  });

  metaContext.doTaskBy = function(apiName, mapProc) {
    var makeProc;
    return makeProc = function(tasks, callback) {
      var iterator;
      iterator = function(next, fn) {
        var message;
        if (typeof fn !== 'function') {
          message = "required function. but include " + (typeof fn);
          next(__.error.invalidArgument(apiName, fn, message));
          return;
        }
        fn(function() {
          next.apply(null, __.slice.call(arguments));
        });
      };
      return mapProc(iterator, callback, tasks);
    };
  };

  contexts.extend({
    fill: metaContext.doTaskBy('pp#fill', contexts.map),
    order: metaContext.doTaskBy('pp#order', contexts.mapOrder)
  });

}).call(this);