
const Parser = require("./Parser.js");


module.exports = class Query {
    constructor(str) {
        this.str = str;
        this.parser = new Parser();

        this.ast = this.parser.parse(this.str);

        if ( this.is_static ) {
            // Walk the tree again to accumulate the static text of the query
            //  (recall 'static' means the text doesn't (conditionally) depend
            //  upon the object-values)
            this.text = this._render_string(this.ast, {}, new Map, []);
        }
    }

    get is_static() {
        return this.ast.is_static;
    }

    get keys() {
        return this.ast.keys;
    }

    generate(obj={}) {

        if ( this.is_static ) {
            return {
                text: this.text,
                values: this.keys.map((k) => obj[k])
            }
        }


        // Needs to actually walk the tree to generate the text
        const keys = new Map();
        const values = [];

        const text = this._render_string(this.ast, obj, keys, values);
        return {
            text,
            values
        }
    }

    _render_string(node, obj, keys, values) {
        switch (node.type) {
            case "Statement":
                return this._render_string(node.body, obj, keys, values);
            case "FragmentList":
                return node.children.map((c) => this._render_string(c, obj, keys, values)).join("");
            case "RawSQL":
                return node.value
            case "VariableInsertion": {
                const key = node.value;
                if ( !keys.has(key) ) {
                    values.push(obj[key]);
                    keys.set(key, `$${values.length}`);
                }
                return keys.get(key)
            }
            case "FallbackInsertion": {
                const key = node.value;
                if ( obj[key] === undefined ) {
                    return node.fallback;
                }
                if ( !keys.has(key) ) {
                    values.push(obj[key]);
                    keys.set(key, `$${values.length}`);
                }
                return keys.get(key)
            }
            case "ConditionalInsertion": {
                const key = node.value;
                if ( obj[key] === undefined ) {
                    return "";
                }
                return this._render_string(node.success, obj, keys, values);
            }
            case "VariableArrayInsertion": {
                const key = node.value;
                if ( !Array.isArray(obj[key]) ) {
                    throw new Error(`Expected key '${node.value}' to be array, but is not`);
                }

                if ( !keys.has(key) ) {
                    keys.set(key, obj[key].map((v) => {
                        values.push(v);
                        return `$${values.length}`;
                    }).join(node.delimiter))
                }

                return keys.get(key);
            }
            case "DelimitedList":
                return node.children.map((c) => this._render_string(c, obj, keys, values)).filter((x) => x).join(node.delimiter)
            default:
                throw new SyntaxError("Unknown node type: "+node.type);
        }
    }
}

