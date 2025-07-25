
const Parser = require("./Parser.js");


module.exports = class Query {
    constructor(str) {
        this.str = str;
        this.parser = new Parser();

        this.ast = this.parser.parse(this.str);
        this.is_static = true;
        this.keys = [];

        this._condense_ast_node(this.ast);
        if ( this.is_static ) {
            // Walk the tree again to accumulate the static text of the query
            //  (recall 'static' means the text doesn't (conditionally) depend
            //  upon the object-values)
            this.text = this._render_string(this.ast, {}, new Map, []);
        }
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

    _condense_ast_node(node) {
        let i;
        switch (node.type) {
            case "RawSQL":
                return;

            case "FallbackInsertion":
            case "VariableArrayInsertion":
                this.is_static = false;
            case "VariableInsertion":
                if ( !this.keys.includes(node.value) ) this.keys.push(node.value);
                return;

            case "FragmentList":
                // Condense all the children
                for ( const c of node.children ) this._condense_ast_node(c);

                // Drop any leading 'dead' nodes (Conditional Insertions which empty bodies)
                while ( node.children.length && node.children[0].dead ) node.children.splice(0, 1)

                // Attampt to combine any children which are both RawSQL (these get
                // split apart by comments) and remove any dead nodes
                i = 0;
                while ( i < node.children.length-1 ) {
                    // Drop any 'dead' nodes (Conditional Insertions which empty bodies)
                    if ( node.children[i+1].dead ) {
                        node.children.splice(i+1, 1);
                        continue;
                    }

                    // If we don't have a paire of RawSQL nodes, shift the comparison over one
                    if ( node.children[i].type != "RawSQL" || node.children[i+1].type != "RawSQL" ) {
                        i += 1;
                        continue;
                    }

                    // Combine the two nodes
                    node.children[i].value = node.children[i].value + node.children[i+1].value
                    node.children.splice(i+1, 1);
                }

                // If this node now only contains a single RawSQL node, than tools farther up the
                // stack can collapse this with other adjacent fragment lists in a similar boat
                if ( node.children.length == 1 && node.children[0].type == "RawSQL" ) node.collapseable = true;

                // On the otherhand, if there are no children, mark this as dead too
                if ( node.children.length == 0 ) node.dead = true;

                return;

            case "ConditionalInsertion":
                // Condense the fragment list
                this._condense_ast_node(node.success);

                // If the fragment list is empty (dead) so are we
                if ( node.success.dead ) {
                    node.dead = true;
                } else {
                    this.is_static = false;
                    if ( !this.keys.includes(node.value) ) this.keys.push(node.value);
                }

                return;

            case "DelimitedList":
                // Condense all the children
                for ( const c of node.children ) this._condense_ast_node(c);

                // Drop any leading 'dead' nodes (FragmentLists which are empty)
                while ( node.children.length && node.children[0].dead ) node.children.splice(0, 1)

                // Attampt to combine any children which are both collapseable
                // and remove any dead nodes
                i = 0;
                while ( i < node.children.length-1 ) {
                    // Drop any 'dead' nodes (FragmentLists which are empty)
                    if ( node.children[i+1].dead ) {
                        node.children.splice(i+1, 1);
                        continue;
                    }

                    // If we don't have a pair of collapseable nodes, shift the comparison over one
                    if ( !node.children[i].collapseable || !node.children[i+1].collapseable ) {
                        i += 1;
                        continue;
                    }

                    // Combine the two nodes
                    node.children[i].children[0].value = node.children[i].children[0].value + node.delimiter + node.children[i+1].children[0].value
                    node.children.splice(i+1, 1);
                }


                // If this node now only contains a single collapseable node, than we can actually replace ourselves
                // with a RawSQL node
                // stack can collapse this with other adjacent fragment lists in a similar boat
                if ( node.children.length == 1 && node.children[0].collapseable ) {
                    node.type = "RawSQL";
                    node.value = node.children[0].children[0].value;
                    delete node.children;
                    return;
                }

                // On the otherhand, if there are no children, mark this as dead too
                if ( node.children.length == 0 ) node.dead = true;

                return;

            default:
                throw new SyntaxError("Unknown node type: "+node.type);
        }
    }
}

