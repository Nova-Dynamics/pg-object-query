
const Parser = require("./Parser.js");


module.exports = class Query {
    constructor(str) {
        this.str = str;
        this.parser = new Parser();
        this.ast = this.parser.parse(this.str);
    }

    generate(obj={}) {
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

