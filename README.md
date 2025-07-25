# pg-object-query
A little utility to generate `pg`-ready queries using key-value pairs rather than arrays

```bash
npm install pg-object-query
```

Write your sql queries using `@<key>` instead of `$<index>`, then use a `Query` object to
handle converting your parameter object back into an array for you! For example:
```js
const { Query } = require("pg-object-query");
const pg = require("pg");
const pool = pg.Pool();

// Don't live in is squalor! Why should you have to keep track of array indicies?
pool.query(`SELECT * FROM users WHERE id = $1`, [1]); // <- Saddness and pain

// Use objects instead!
const query = new Query(`SELECT * FROM users WHERE id = @id`); // <- Use key names instead!
pool.query(query.generate({ id: 1 }));
```

Under the hood, `pg-object-query` uses Object SQL, a templating language for creating injection-safe
SQL queries with conditional logic. You can view the whole grammar below, but here are some examples.

## Examples
### Using insertion variables
OSQL let's you define insertion variables by prefixing a identifier with and `@` symbol, and then `pg-object-query`
will look for that variable name as a key in your query object:
```SQL
-- A simple variable
SELECT * FROM users WHERE id = @id
-- Becomes
SELECT * FROM users WHERE id = $1

-- Or use 2
SELECT * FROM users WHERE id = @id AND name = @name
-- Becomes
SELECT * FROM users WHERE id = $1 AND name = $2
```

Notice, that this operation does *not* directly insert the value of the variable into the compiled SQL statement,
but instead pushes the value into an array, and then indexes it properly for you, so as to utilize `pg`'s SQL escaping routines.

If you *really* need to use a `@` symbol in you SQL query (like for JSON/Array operators) you can escape the character by repeating it: `@@` -- see the
next section.

### Using conditional insertions
Additionally, you might want to include (or exclude) an entire clause based on if a value is present. You can use the `@KEY?{ OSQL }`
syntax to include a OSQL snippet, but only if the query object's value for `KEY` is not `undefined`
```SQL
-- This query will return all users, unless you provide `id`, then it only returns one user
SELECT * FROM users @id?{ WHERE id = @id }
```

You can also add a `:{ OSQL }` block at the end for and "else" case (when the key *is* `undefined`)
```SQL
-- This query will return either count all the users, or return them depending on if 'count' is present
SELECT @count ? { COUNT(id) } : { * } FROM users
```

This can be helpful in the case of updates if you want to code `undefined` to mean "don't update" rather than "set null".
For example:
```SQL
UPDATE users SET name = @name?{@name}:{name} WHERE id = @id

-- Becomes the following "no-op" if name is undefined
UPDATE users SET name = name WHERE id = $1

-- Otherwise it compiles to a set if name is null or some other value
UPDATE users SET name = $1 WHERE id = $2
```

Note, OSQL reserves curly braces for the snippet block here. This is only really painful if you use lots of hard-coded
JSON or arrays. If you *really* need to use a `{` or `}` in your query, you can escape the character by repeating it.
```SQL
-- This query has it's `{}` escaped
SELECT '{{ 1, 2 }}'::int[]

-- And here we escape `@>`
SELECT '{{ 1, 2 }}'::int[] @@> '{{ 1 }}'::int[]
```

### Using delimited arrays
If you are including conditional clauses, you might run into the situation of needing to also conditionally add commas or "AND"s between entries, but only if they both exist. This process is simplified by using the `(,)[ OSQL; OSQL; ... ]` syntax. Here, the OSQL snippets
inside the square brackets (delimited by `;`) will be compiled (and striped if empty), and then rendered with a `,` between them. For example:
```SQL
-- Notice the extra `;` after name
SELECT (,)[ id; name; ] FROM users
-- Becomes:
SELECT id, name FROM users

-- If the a conditional evaluates to false than it is striped out:
SELECT (,)[ id; @name?{@name}; ] FROM users
-- Becomes if name is undefined:
SELECT id FROM users
-- Otherwise it becomes:
SELECT id, $1 FROM users
```

You can also do the same thing for "AND" and "OR" via `(&)[...]` and `(|)[...]`
```SQL
SELECT * FROM users WHERE (&)[ id = @id; NOT disabled ]
-- Becomes:
SELECT * FROM users WHERE id = $1 AND NOT disabled


SELECT * FROM users WHERE (|)[ id = @id; email = @email ]
-- Becomes:
SELECT * FROM users WHERE id = $1 OR email = $2
```

As with everything else, you can escape `;`, `[`, and `]` by repeating the character.
```SQL
-- This query has it's `;` escaped so the `pg-object-query` will ignore it
SELECT * FROM users;;
```
### Using spread variables
Very occationally, you have an array as the value in a query object, which you would like to spread into a
set of delimited variable insertions, you can use the `(,)[ ...@KEY ]` syntax to do this. For example, if
your query object is `{ ids: [1,2,3] }`, and you want to get all the users which match any of these ids, you can:
```SQL
SELECT * FROM users WHERE id IN ((,)[ ...@ids ])
-- Which becomes:
SELECT * FROM users WHERE id IN ($1, $2, $3)
```

Notice, that this operation does *not* directly insert the value of the array into the compiled SQL statement,
but instead "flattens" the array out so as to still utilize `pg`'s SQL escaping routines.


### Loading from a file
`pg-object-query` has a load function which will parse a set of OSQL statements and create an object
holding a query object for each:
```js
const { load } = require("pg-object-query");


const osql = `
-- @query get_users
SELECT * FROM users @id?{ WHERE id = @id }

-- @query create_user
INSERT INTO users ((,)[
    name;
    email;
    @enabled?{ enabled };
]) VALUES ((,)[
    @name;
    @email;
    @enabled?{ @enabled };
])
`


load(osql); // returns { get_users: <Query>, create_user: <Query> }
```

## OSQL Grammar
A query string is composed of a Statement:
```
Statement
    : FragmentList

FragmentList
    : Fragment
    | Fragment + FragmentList

Fragment
    : Insertion
    | DelimitedArray
    | RawSQL

Insertion
    : VariableInsertion
    | ConditionalInsertion

VariableInsertion
    : Key

Key
    : `@` + [A-z0-9_]+

ConditionalInsertion
    : Key + \s* + `?` + \s* + `{` + \s* + FragmentList + \s* + `}`
    | Key + \s* + `?` + \s* + `{` + \s* + FragmentList + \s* + `}`+ `:` + \s* + `{` + \s* + FragmentList + \s* + `}`

DelimitedArray
    : AndDelimitedArray
    | OrDelimitedArray
    | CommaDelimtedArray

AndDelimitedArray
    : `(&)` + \s* + `[` + \s* + DelimitedList + \s* + `]`
    | `(&)` + \s* + `[` + \s* + SpreadVariable + \s* + `]`
OrDelimitedArray
    : `(|)` + \s* + `[` + \s* + DelimitedList + \s* + `]`
    | `(|)` + \s* + `[` + \s* + SpreadVariable + \s* + `]`
CommaDelimitedArray
    : `(,)` + \s* + `[` + \s* + DelimitedList + \s* + `]`
    | `(,)` + \s* + `[` + \s* + SpreadVariable + \s* + `]`

SpreadVariable
    : `...` + VariableArrayInsertion

VariableArrayInsertion
    : Key (Note, this key is expected to point at an array of literals)

DelimitedList
    : FragmentList + \s* + `;`?
    | FragmentList + \s* + `;` + \s* + DelimitedList

RawSQL
    : Any else

```


## TODOs
  - Allow "map" operations over SpreadVariables
  - Add logical and/or for the conditional insert key evaluations (e.g. `@lat&lon?{ geog = GEOG(@lat @lon) }`, or maybe `@lat??@lon?{ block }, or maybe @{ @lat??@lon } ? {...} : {...}`)
