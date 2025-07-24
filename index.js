

const Query = require("./lib/Query.js");

/**
 * Load a sql chunk into an object of parsed queries
 *
 *
 * Example:
 * ```js
 * const sql = `
 * -- @query get_user
 * SELECT * FROM users WHERE id = @id;;
 *
 * -- @query delete_user
 * DELETE FROM users WHERE id = @id
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

        out[bound.name] = new Query(sql);
    }

    return out;
}



module.exports = {
    Query,
    load
}

