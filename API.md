## Classes

<dl>
<dt><a href="#Query">Query</a></dt>
<dd><p>Class to wrap the parsed query</p>
<p>Example usage</p>
<pre><code class="language-js">// Renders &#39;static&#39; queries, allowing for name parameters
const query = new Query(&quot;myquery&quot;, &quot;SELECT * FROM users WHERE id = @id&quot;)
query.generate({ id: 1 }); // returns { text: &quot;SELECT * FROM users WHERE id = $1&quot;, values: [ 1 ] };

// Renders &#39;non-static&#39; queries, allowing for undefined parameters to be given sql fallbacks. Below, `email` is undefined,
//   So rather than setting null, it falls back to a no-op operation.
const query = new Query(&quot;myquery&quot;, &quot;UPDATE users SET name = @name??name, email = @email??email WHERE id = @id&quot;)
query.generate({ name: &quot;Bob&quot;, id: 1 }); // returns { text: &quot;UPDATE users SET name = $1, email = email WHERE id = $2&quot;, values: [ &quot;Bob&quot;, 1 ] };
</code></pre>
</dd>
</dl>

## Functions

<dl>
<dt><a href="#load">load()</a></dt>
<dd><p>Load a sql chunk into an object of parsed queries</p>
<p>Example:</p>
<pre><code class="language-js">const sql = `
-- @query get_user
SELECT * FROM users WHERE id = @id;

-- @query delete_user
DELETE FROM users WHERE id = @id;
`


const queries = load(sql); // returns { get_user: &lt;Query&gt;, delete_user: &lt;Query&gt; }
</code></pre>
</dd>
</dl>

<a name="Query"></a>

## Query
Class to wrap the parsed query


Example usage
```js
// Renders 'static' queries, allowing for name parameters
const query = new Query("myquery", "SELECT * FROM users WHERE id = @id")
query.generate({ id: 1 }); // returns { text: "SELECT * FROM users WHERE id = $1", values: [ 1 ] };

// Renders 'non-static' queries, allowing for undefined parameters to be given sql fallbacks. Below, `email` is undefined,
//   So rather than setting null, it falls back to a no-op operation.
const query = new Query("myquery", "UPDATE users SET name = @name??name, email = @email??email WHERE id = @id")
query.generate({ name: "Bob", id: 1 }); // returns { text: "UPDATE users SET name = $1, email = email WHERE id = $2", values: [ "Bob", 1 ] };
```

**Kind**: global class  

* [Query](#Query)
    * [new Query(name, str)](#new_Query_new)
    * [.generate()](#Query+generate)

<a name="new_Query_new"></a>

### new Query(name, str)
Constructor


| Param | Type | Description |
| --- | --- | --- |
| name | <code>String</code> | a name for this query |
| str | <code>String</code> | a sql string to be parsed |

<a name="Query+generate"></a>

### query.generate()
Generate the pg-valid query arguments from this query given parameters

**Kind**: instance method of [<code>Query</code>](#Query)  
<a name="load"></a>

## load()
Load a sql chunk into an object of parsed queries


Example:
```js
const sql = `
-- @query get_user
SELECT * FROM users WHERE id = @id;

-- @query delete_user
DELETE FROM users WHERE id = @id;
`


const queries = load(sql); // returns { get_user: <Query>, delete_user: <Query> }

```

**Kind**: global function  
