
const TOKEN_REGEX = [
    [ /(?<!@)@([A-z0-9_]+)(?=\W|$)/, "Key" ],

    [ /\s*[?]\s*[{](?!{)\s*/, "?{" ],
    [ /\s*[:]\s*[{](?!{)\s*/, ":{" ],
    [ /\s*(?<!})[}](?!})/, "}" ],

    [ /\([&]\)\s*\[(?!\[)\s*/, "(&)[" ],
    [ /\([|]\)\s*\[(?!\[)\s*/, "(|)[" ],
    [ /\([,]\)\s*\[(?!\[)\s*/, "(,)[" ],
    [ /\s*(?<!\])\](?!\])/, "]" ],
    [ /\s*(?<!;);(?!;)\s*/, ";" ],

    [ /\s*(?<!\.)\.\.\.(?!\.)\s*/, "..." ],

    [ /\s*--.*/, "Comment" ],
    [ /\/\*[\s\S]*?\*\//, "Comment" ]
];


module.exports = class Tokenizer {
    constructor() {
        this._str = ""
        this._cursor = 0;

        this._next_token = { type: null, length: 0 };
    }

    get cursor() {
        return this._cursor;
    }

    get EOF() {
        return this._cursor >= this._str.length;
    }

    get next_token() {
        return this._next_token;
    }

    init(str) {
        this._str = str;
        this._cursor = 0;

        this.scan_token()
    }


    scan_token(last_token=null) {
        if ( this.EOF ) {
            throw new SyntaxError("Unexpected end of input");
        }

        this._cursor += this.next_token.length;
        last_token ??= { ...this.next_token };

        if ( this.EOF ) {
            this._next_token = {
                type: "EOF",
                length: 0
            }
            return last_token;
        }


        const str = this._str.slice(this._cursor);
        let min_length = str.length;
        for ( const [ regex, type ] of TOKEN_REGEX ) {
            const match = regex.exec(str);
            if ( !match ) continue;
            if ( match.index == 0 ) {
                this._next_token = {
                    type: type,
                    value: match[1],
                    length: match[0].length
                }
                return type=="Comment"?this.scan_token(last_token):last_token;
            }

            min_length = Math.min(min_length, match.index);
        }

        // Only here if we didn't match anything, so we can assume we just
        // have RawSQL
        this._next_token = {
            type: "RawSQL",
            value: str.slice(0, min_length),
            length: min_length
        }
        return last_token;
    }
}
