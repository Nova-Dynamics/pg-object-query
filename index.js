
/**
 * Class to wrap the parsed query
 *
 *
 * Example usage
 * ```js
 * // Renders 'static' queries, allowing for name parameters
 * const query = new Query("myquery", "SELECT * FROM users WHERE id = @id")
 * query.generate({ id: 1 }); // returns { text: "SELECT * FROM users WHERE id = $1", values: [ 1 ] };
 *
 * // Renders 'non-static' queries, allowing for undefined parameters to be given sql fallbacks. Below, `email` is undefined,
 * //   So rather than setting null, it falls back to a no-op operation.
 * const query = new Query("myquery", "UPDATE users SET name = @name??name, email = @email??email WHERE id = @id")
 * query.generate({ name: "Bob", id: 1 }); // returns { text: "UPDATE users SET name = $1, email = email WHERE id = $2", values: [ "Bob", 1 ] };
 * ```
 */
class Query {
    /**
     * Constructor
     * @param {String} name - a name for this query
     * @param {String} str - a sql string to be parsed
     */
    constructor(name, str) {
        this.name = name;
        this.str = str;

        this.compile();
    }

    /**
     * Generate the pg-valid query arguments from this query given parameters
     */
    generate(params={}) {
        if ( this.static ) {
            return { text: this.text, values: keys.map((key) => params[key]) /* TODO : auto prepare statements? */ };
        } else {
            const key_indexes = {};
            let query = "";
            const values = [];
            for ( const p of this.parts ) {
                if ( p.type == "text") {
                    query = query + p.text;
                    continue;
                }

                // Render out fallbacks, if this part has one AND the value actually is undefined
                const value = params[p.key];
                if ( value === undefined && p.fallback ) {
                    query = query + p.fallback;
                    continue;
                }


                // Load the push the value in if we haven't seen the key yet
                if ( !key_indexes[p.key] ) {
                    values.push(value);
                    key_indexes[p.key] = values.length;
                }

                query = query + "$" + key_indexes[p.key];

            }
            return {
                text: query,
                values
            }
        }
    }

    /**
     * Compile this query
     * @private
     */
    compile() {
        let str_idx = 0;
        this.parts = [];
        const matches = this.str.matchAll(/(?<=\s|^)@([\w]+)(\?\?([\w.-`]+))?/g);
        for ( const match of matches ) {
            this.parts.push({
                type: "text",
                text: this.str.slice(str_idx, match.index)
            })
            this.parts.push({
                type: "key",
                key: match[1],
                fallback: match[3]
            })
            str_idx = match.index + match[0].length;
        };

        if ( this.str.slice(str_idx) ) this.parts.push({
            type: "text",
            text: this.str.slice(str_idx)
        })

        this.static = this.parts.every((p) => p.type != "key" || p.fallback==undefined);

        if ( this.static ) {
            // No fallbacks, can simply render the query

            this.keys = [];
            for ( const p of this.parts ) {
                if ( p.type != "key" ) continue;
                if ( !this.keys.includes(p.key) ) this.keys.push(p.key);
            }

            this.text = this.parts.reduce((a, p) => {
                if ( p.type == "text" ) return a + p.text;
                return a + "$" + (this.keys.indexOf(p.key) + 1);
            }, "");
        }
    }
}


/**
 * Load a sql chunk into an object of parsed queries
 *
 *
 * Example:
 * ```js
 * const sql = `
 * -- @query get_user
 * SELECT * FROM users WHERE id = @id;
 *
 * -- @query delete_user
 * DELETE FROM users WHERE id = @id;
 * `
 *
 *
 * const queries = load(sql); // returns { get_user: <Query>, delete_user: <Query> }
 *
 * ```
 */
function load(str) {
    const headers = str.matchAll(/^\s*--\s*@query\s(\w+)/gm);
    const bounds = [];
    let i = 0;
    for ( const header of headers ) {
        if ( i != 0 ) bounds.at(-1).end = header.index;
        bounds.push({
            start: header.index + header[0].length,
            name: header[1]
        })
        i++;
    };

    if ( !bounds.length ) return {};
    bounds.at(-1).end = str.length;

    const out = {};
    for ( const bound of bounds ) {
        const sql = str.slice(bound.start, bound.end).trim();
        if ( !sql ) throw new Error(`Query '${bound.name}' has no query`);

        if ( out[bound.name] ) throw new Error(`Cannot have 2 queries with the same name (${bound.name})`);

        out[bound.name] = new Query(bound.name, sql);
    }

    return out;
}



module.exports = {
    Query,
    load
}

