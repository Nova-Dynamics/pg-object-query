
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
        return fragment_list;
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
                    value: this.eat("RawSQL").value.replace(/;;/g, ";").replace(/@@/g, "@").replace(/[{][{]/g, "{").replace(/\[\[/g, "[").replace(/\]\]/g, "]").replace(/[}][}]/g, "}")
                }
            default:
                throw new SyntaxError("Unexpected token: '"+this.tokenizer.next_token.type+"' near character: "+this.tokenizer.cursor);
        }
    }


    parse_insertion() {
        const key = this.eat("Key").value;

        switch (this.tokenizer.next_token.type) {
            case "?{": {
                return this.parse_conditional_insertion(key);
            }
            case "SQLWordFallback": {
                const fallback = this.eat("SQLWordFallback").value;
                return {
                    type: "FallbackInsertion",
                    value: key,
                    fallback: fallback
                }
            }
            default:
                return {
                    type: "VariableInsertion",
                    value: key
                };
        }
    }

    parse_conditional_insertion(key) {
        this.eat("?{");
        const fragment_list = this.parse_fragment_list();
        this.eat("}");

        return {
            type: "ConditionalInsertion",
            value: key,
            success: fragment_list
        };

    }

    parse_delimited_list(delimiter) {
        switch ( this.tokenizer.next_token.type ) {
            case "Key":
            case "]": // Treat empty variable lists like empty conditional inserts
                return this.parse_conditional_insert_list(delimiter)
            case "...": {
                this.eat("...");
                return {
                    type: "VariableArrayInsertion",
                    value: this.eat("Key").value,
                    delimiter: delimiter
                }
            }
            default:
                throw new SyntaxError(`Unexpected token type: '${this.tokenizer.next_token.type}' near ${this.tokenizer.cursor}`);
        }
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

    parse_conditional_insert_list(delimiter) {
        const obj = {
            type: "ConditionalInsertList",
            delimiter,
            children: []
        }

        while ( this.tokenizer.next_token.type == "Key" ) {
            const key = this.eat("Key").value;
            obj.children.push(this.parse_conditional_insertion(key));

            if ( this.tokenizer.next_token.type != "]" ) this.eat(";");
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

}
