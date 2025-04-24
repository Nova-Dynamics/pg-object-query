# pg-object-query
A little utility to generate `pg`-ready queries using key-value pairs rather than arrays

```bash
npm install pg-object-query
```


Write your sql queries using `@<key>` instead of `$<index>`, then use a `Query` object
handle converting your parameter object back into an array for you!

As a bonus -- you can allow use the following syntax `@key??SQL_NAME`, and then if your
parameter object has `key` set to undefined, the string literal `SQL_NAME` will be written
in instead. This is useful if you are writing an `UPDATE` statement, and want `undefined`
mean "don't modify" rather than "set null".

See [the full API docs here](API.md) for details.

## Example
```js
const { Query, load } = require("pg-object-query");
const pg = require("pg");

const pool = pg.Pool();

// Renders 'static' queries, allowing for name parameters
const query = new Query("myquery", "SELECT * FROM users WHERE id = @id")
const obj = query.generate({ id: 1 }); // returns { text: "SELECT * FROM users WHERE id = $1", values: [ 1 ] };
await pool.query(obj);


// Renders 'non-static' queries, allowing for undefined parameters to be given sql fallbacks. Below, `email` is undefined,
//   So rather than setting null, it falls back to a no-op operation.
const query = new Query("myquery", "UPDATE users SET name = @name??name, email = @email??email WHERE id = @id")
const obj2 = query.generate({ name: "Bob", id: 1 }); // returns { text: "UPDATE users SET name = $1, email = email WHERE id = $2", values: [ "Bob", 1 ] };
await pool.query(obj2);


// Feed a full .sql file with light annotations (sqlc-inspired) 
const sql = `
-- @query get_user
SELECT * FROM users WHERE id = @id;

-- @query delete_user
DELETE FROM users WHERE id = @id;
`
const queries = load(sql); // returns { get_user: <Query>, delete_user: <Query> }
```
