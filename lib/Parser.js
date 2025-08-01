
const { EventEmitter } = require("events");
const Tokenizer = require("./Tokenizer.js");

module.exports = class Parser extends EventEmitter {
    constructor() {
        super();
        this.tokenizer = new Tokenizer();
        this._str = "";
    }

    parse(str) {
        this._str = str;
        this.tokenizer.init(str)
        const fragment_list = this.parse_fragment_list();
        if ( !this.tokenizer.EOF ) {
            throw new SyntaxError(`Unexpected token '${this.tokenizer.next_token.type}' characters near: ${this.tokenizer.cursor}. Exepcted EOF.`);
        }

        // Walk the graph to check if we can condense any nodes
        const [ is_static, keys ] = this._condense_node(fragment_list, true/*is_static*/, []/*keys*/);
        return {
            type: "Statement",
            body: fragment_list,
            is_static: is_static,
            keys: keys
        };
    }


    parse_fragment_list() {
        const obj = {
            type: "FragmentList",
            children: []
        };

        switch ( this.tokenizer.next_token.type ) {
            // Can be end of file (empty)
            case "EOF":
            // Can be closing of statement (also empty)
            case ";":
            case "}":
            case "]":
            // Can be a Fragment
            case "StringLiteral":
            case "Key":
            case "(&)[":
            case "(|)[":
            case "(,)[":
            case "RawSQL":
                // Fine
                break;
            default:
                throw new SyntaxError(`Unexpected token '${this.tokenizer.next_token.type}' near ${this.tokenizer.cursor}. Expected a OSQL statement or termination`);
        }

        while ( !this.tokenizer.EOF && this.tokenizer.next_token.type != "]" && this.tokenizer.next_token.type != ";" && this.tokenizer.next_token.type != "}") {
            obj.children.push(this.parse_fragment());
        }

        return obj;
    }


    parse_fragment() {
        switch ( this.tokenizer.next_token.type ) {
            case "StringLiteral":
            case "Key":
                return this.parse_insertion();
            case "(&)[": {
                this.eat("(&)[")
                const obj = this.parse_delimited_list(" AND ")
                this.eat("]");
                return obj;
            }
            case "(|)[": {
                this.eat("(|)[")
                const obj = this.parse_delimited_list(" OR ")
                this.eat("]");
                return obj;
            }
            case "(,)[": {
                this.eat("(,)[")
                const obj = this.parse_delimited_list(", ")
                this.eat("]");
                return obj;
            }
            case "RawSQL":
                return {
                    type: "RawSQL",
                    value: this.eat("RawSQL").value.replace(/;;/g, ";").replace(/@@/g, "@").replace(/\$\$/g, "$").replace(/[{][{]/g, "{").replace(/\[\[/g, "[").replace(/\]\]/g, "]").replace(/[}][}]/g, "}")
                }
            default:
                throw new SyntaxError("Unexpected token: '"+this.tokenizer.next_token.type+"' near character: "+this.tokenizer.cursor);
        }
    }


    parse_insertion() {
        let key;
        switch (this.tokenizer.next_token.type) {
            case "Key":
                key = this.eat("Key").value;
                if (this.tokenizer.next_token.type == "?{" ) {
                    return this.parse_conditional_insertion(key);
                } else {
                    return {
                        type: "VariableInsertion",
                        value: key
                    };
                }
            case "StringLiteral":
                key = this.eat("StringLiteral").value;
                return {
                    type: "StringLiteralInsertion",
                    value: key
                };
            default:
                throw new SyntaxError("Unexpected token: '"+this.tokenizer.next_token.type+"' near character: "+this.tokenizer.cursor);
        }

    }

    parse_conditional_insertion(key) {
        this.eat("?{");
        const success_fragment_list = this.parse_fragment_list();
        this.eat("}");

        let failure_fragment_list = null;
        if ( this.tokenizer.next_token.type == ":{" ) {
            this.eat(":{");
            failure_fragment_list = this.parse_fragment_list();
            this.eat("}");
        }

        return {
            type: "ConditionalInsertion",
            value: key,
            success: success_fragment_list,
            failure: failure_fragment_list
        };

    }

    parse_delimited_list(delimiter) {

        if ( this.tokenizer.next_token.type == "..." ) {
            this.eat("...");
            return {
                type: "VariableArrayInsertion",
                value: this.eat("Key").value,
                delimiter: delimiter
            }
        }

        const obj = {
            type: "DelimitedList",
            delimiter: delimiter,
            children: []
        };

        while ( this.tokenizer.next_token.type == ";" ) this.eat(";");
        while ( !this.tokenizer.EOF && this.tokenizer.next_token.type != "]" && this.tokenizer.next_token.type != "}") {
            obj.children.push(this.parse_fragment_list());
            while ( this.tokenizer.next_token.type == ";" ) this.eat(";");
        }

        return obj;
    }

    eat(token_type) {
        if ( token_type && this.tokenizer.next_token.type != token_type ) {
            throw new SyntaxError(`Unexpected token '${this.tokenizer.next_token.type}' near character: ${this.tokenizer.cursor}. Expected '${token_type}'.`)
        }


        const token = this.tokenizer.scan_token();
        this.emit("token", token);
        return token;
    }


    _condense_node(node, is_static, keys) {
        let i;
        switch (node.type) {
            case "RawSQL":
                return [ is_static, keys ];

            case "VariableArrayInsertion":
            case "StringLiteralInsertion":
                is_static = false;
            case "VariableInsertion":
                if ( !keys.includes(node.value) ) keys.push(node.value);
                return [ is_static, keys ];

            case "FragmentList":
                // Condense all the children
                for ( const c of node.children ) {
                    [ is_static, keys ] = this._condense_node(c, is_static, keys);
                }

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

                return [ is_static, keys ];

            case "ConditionalInsertion":
                // Condense the fragment list
                [ is_static, keys ] = this._condense_node(node.success, is_static, keys);

                if ( node.failure ) {
                    // Condense the other fragment list
                    [ is_static, keys ] = this._condense_node(node.failure, is_static, keys);
                }

                // If the fragment list is empty (dead) so are we
                if ( node.success.dead && (!node.failure || node.failure.dead) ) {
                    node.dead = true;
                } else {
                    is_static = false;
                    if ( !keys.includes(node.value) ) keys.push(node.value);
                }

                return [ is_static, keys ];

            case "DelimitedList":
                // Condense all the FragmentList children
                for ( const frag_list of node.children ) {
                    [ is_static, keys ] = this._condense_node(frag_list, is_static, keys);

                    // Since we are already removing whitespace between each fragment_list,
                    // we can also safely trim the first and last fragments
                    switch ( frag_list.children.length ) {
                        case 0:
                            break;
                        case 1:
                            if ( frag_list.children[0].type != "RawSQL" ) break;
                            frag_list.children[0].value = frag_list.children[0].value.trim();
                            if ( frag_list.children[0].value.length == 0 ) {
                                frag_list.children.splice(0, 1);
                                frag_list.dead = true;
                            }
                            break;
                        default: {
                            let i = frag_list.children.length - 1;
                            // Remove terminal whitespace from the last child (only if it is RawSQL)
                            if ( frag_list.children[i].type == "RawSQL" ) frag_list.children[i].value = frag_list.children[i].value.replace(/\s*$/, "");

                            // Make sure the node shouldn't now be pruned
                            if ( frag_list.children[i].value.length == 0 ) frag_list.children.splice(i, 1);

                            // Remove terminal whitespace from the last child (only if it is RawSQL)
                            if ( frag_list.children[0].type == "RawSQL" ) frag_list.children[0].value = frag_list.children[0].value.replace(/^\s*/, "");

                            // Make sure the node shouldn't now be pruned
                            if ( frag_list.children[0].value.length == 0 ) frag_list.children.splice(0, 1);


                            /**
                             * Note, because of condensing, we should never have a list of 2 RawSQLs next to each other, so if both just
                             *  got spliced out, we *must* have something in between them. so the following `if` will never trigger
                             */
                            // if ( frag_list.children.length == 0 ) {
                            //     frag_list.dead = true;
                            // }
                            break;
                        }
                    }
                }

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
                    node.children[i].children[0].value = node.children[i].children[0].value.trim() + node.delimiter + node.children[i+1].children[0].value.trim()
                    node.children.splice(i+1, 1);
                }


                // If this node now only contains a single collapseable node, than we can actually replace ourselves
                // with a RawSQL node
                // stack can collapse this with other adjacent fragment lists in a similar boat
                if ( node.children.length == 1 && node.children[0].collapseable ) {
                    node.type = "RawSQL";
                    node.value = node.children[0].children[0].value;
                    delete node.children;
                    return [ is_static, keys ];
                }

                // On the otherhand, if there are no children, mark this as dead too
                if ( node.children.length == 0 ) node.dead = true;

                return [ is_static, keys ];

            default:
                throw new SyntaxError("Unknown node type: "+node.type);
        }
    }
}
