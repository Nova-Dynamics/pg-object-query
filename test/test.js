

`
-- @query get_your_mom
SELECT * FROM your_mom
WHERE id = @id??t.id
    OR t.test = @test
    OR id = @id
    OR id = @> cons.com


-- @query get_your_other_mom
SELECT * FROM your_mom
WHERE id = @id
`



const { expect } = require('chai');
const { Query, load } = require("../index.js");

describe("Query", function() {
    describe("Simple variables", function() {
        const q = new Query(
            `
            SELECT * FROM table AS t
            WHERE t.id = @id
                OR t.other = @other
                OR t.id = @id
            `
        );
        const query1 = q.generate({ id: 1, other: "bob" });

        it("Static attributes", async function() {
            expect(q.is_static, "Correct calls static").to.equal(true);
            expect(q.text, "Correct text").to.equal(`
            SELECT * FROM table AS t
            WHERE t.id = $1
                OR t.other = $2
                OR t.id = $1
            `)
            expect(q.keys, "Gets both keys").to.have.length(2);
            expect(q.keys[0], "Key 1 is id").to.equal("id")
            expect(q.keys[1], "Key 2 is other").to.equal("other");
        });
        it("Renders keys in correct order", async function() {
            expect(query1.text, "Correct text").to.equal(`
            SELECT * FROM table AS t
            WHERE t.id = $1
                OR t.other = $2
                OR t.id = $1
            `)
            expect(query1.values, "Gets both keys").to.have.length(2);
            expect(query1.values[0], "Key 1 is id").to.equal(1)
            expect(query1.values[1], "Key 2 is other").to.equal("bob");
        });


        const q2 = new Query(
            `SELECT * FROM table AS t`
        );
        query2 = q2.generate({});
        it("Empty queries have correct static attributes", async function() {
            expect(q2.text, "Renders text").to.equal(`SELECT * FROM table AS t`);
            expect(q2.keys, "No keys").to.have.length(0);
        });
        it("Empty queries can render", async function() {
            expect(query2.text, "Renders text").to.equal(`SELECT * FROM table AS t`);
        });
        it("Empty queries are empty", async function() {
            expect(query2.values, "Identifies query as empty").to.have.length(0);
        });
    });
    describe("String Literals", function() {
        const q = new Query(
            `
            SELECT * FROM table AS t
            ORDER BY $column $direction
            `
        );
        const query1 = q.generate({ column: "id", direction: "ASC" });

        it("Isn't static", async function() {
            expect(q.is_static, "Correct calls not static").to.equal(false);
            expect(q.keys, "Gets both keys").to.have.length(2);
            expect(q.keys[0], "Key 1 is column").to.equal("column")
            expect(q.keys[1], "Key 2 is direction").to.equal("direction");
        });

        it("Renders keys in correct order", async function() {
            expect(query1.text, "Correct text").to.equal(`
            SELECT * FROM table AS t
            ORDER BY id ASC
            `)
            expect(query1.values, "No keys").to.have.length(0);
        });

        it("Can escape $", async function() {
            const q = new Query(
                `
                SELECT * FROM table AS t
                ORDER BY $$column $$direction
                `
            );
            expect(q.text, "Correct text").to.equal(`
                SELECT * FROM table AS t
                ORDER BY $column $direction
                `)
        });

        it("Can't use $ with conditional checks", async function() {
            expect(() => new Query(
                `SELECT $column{id}:{name} FROM users`
            )).to.throw(SyntaxError);
        });

    });
    describe("Static Queries", function() {
        it("No variables are static", async function() {
            const query = new Query(`SELECT * FROM /* comment */ users`);
            expect(query.is_static, "Identifies static").to.equal(true);
            expect(query.text, "Has correct text").to.equal(`SELECT * FROM  users`);
            expect(query.keys, "Has correct length keys").to.have.length(0);
        });
        it("Arrays with pure sql entries are static", async function() {
            const query = new Query(`SELECT (,)[ id; name; ] FROM users`);
            expect(query.is_static, "Identifies static").to.equal(true);
            expect(query.text, "Has correct text").to.equal(`SELECT id, name FROM users`);
            expect(query.keys, "Has correct length keys").to.have.length(0);
        });
        it("Even nested Arrays with pure sql entries are static", async function() {
            const query = new Query(`SELECT (,)[ id; (&)[ active; verified ] AS good; ] FROM users`);
            expect(query.is_static, "Identifies static").to.equal(true);
            expect(query.text, "Has correct text").to.equal(`SELECT id, active AND verified AS good FROM users`);
            expect(query.keys, "Has correct length keys").to.have.length(0);
        });
        it("Pure variables are static", async function() {
            const query = new Query(`SELECT * FROM /* comment */ users WHERE id = @id AND name = @name`);
            expect(query.is_static, "Identifies static").to.equal(true);
            expect(query.text, "Has correct text").to.equal(`SELECT * FROM  users WHERE id = $1 AND name = $2`);
            expect(query.keys, "Has correct length keys").to.have.length(2);
            expect(query.keys[0], "Gets first key correct").to.equal("id");
            expect(query.keys[1], "Gets second key correct").to.equal("name");
        });
        it("Repeated variables are debounced", async function() {
            const query = new Query(`SELECT id, @name AS name FROM /* comment */ users WHERE id = @id AND name = @name`);
            expect(query.is_static, "Identifies static").to.equal(true);
            expect(query.text, "Has correct text").to.equal(`SELECT id, $1 AS name FROM  users WHERE id = $2 AND name = $1`);
            expect(query.keys, "Has correct length keys").to.have.length(2);
            expect(query.keys[0], "Gets first key correct").to.equal("name");
            expect(query.keys[1], "Gets second key correct").to.equal("id");
        });
        it("Empty conditionals are still static", async function() {
            const query = new Query(`SELECT * FROM users @id?{/* empty */}`);
            expect(query.is_static, "Identifies static").to.equal(true);
            expect(query.text, "Has correct text").to.equal(`SELECT * FROM users `);
            expect(query.keys, "Has correct length keys").to.have.length(0);
        });
        it("Empty conditionals (with else) are still static", async function() {
            const query = new Query(`SELECT * FROM users @id?{/* empty */}:{/* also empty */}`);
            expect(query.is_static, "Identifies static").to.equal(true);
            expect(query.text, "Has correct text").to.equal(`SELECT * FROM users `);
            expect(query.keys, "Has correct length keys").to.have.length(0);
        });
        it("Arrays with pure sql + variables entries are static", async function() {
            const query = new Query(`SELECT * FROM users WHERE (&)[ id IS NOT NULL; name = @name ]`);
            expect(query.is_static, "Identifies static").to.equal(true);
            expect(query.text, "Has correct text").to.equal(`SELECT * FROM users WHERE id IS NOT NULL AND name = $1`);
            expect(query.keys, "Has correct length keys").to.have.length(1);
            expect(query.keys[0], "Gets first key correct").to.equal("name");
        });

        it("Conditionals are not static", async function() {
            const query = new Query(`SELECT * FROM users @id?{ WHERE id = @id }`);
            expect(query.is_static, "Identifies as non static").to.equal(false);
            expect(query.keys, "Has correct length keys").to.have.length(1);
            expect(query.keys[0], "Gets first key correct").to.equal("id");
        });
        it("Spreads are not static", async function() {
            const query = new Query(`SELECT * FROM users WHERE id IN ((,)[ ...@ids ])`);
            expect(query.is_static, "Identifies as non static").to.equal(false);
            expect(query.keys, "Has correct length keys").to.have.length(1);
            expect(query.keys[0], "Gets first key correct").to.equal("ids");
        });
    })
    describe("Special characters", function() {
        it("Can escape '@'", async function() {
            const query = new Query(
                `
                UPDATE table SET
                    email = 'bob@@joe.com'
                WHERE t.id = @id
                `
            ).generate({ id: 1 });
            expect(query.text, "Converts @@ into @").to.equal(`
                UPDATE table SET
                    email = 'bob@joe.com'
                WHERE t.id = $1
                `);
        });
        it("JSON Selectors", async function() {
            const query = new Query(
                `SELECT * FROM table WHERE json_col @@> '{{"key": "value"}}' OR json_col <@@ 'bad' AND id = @id`
            ).generate({ id: 1 });
            expect(query.text, "Converts @@ into @ and {{ into {").to.equal(`SELECT * FROM table WHERE json_col @> '{"key": "value"}' OR json_col <@ 'bad' AND id = $1`)
        });
    });
    describe("Muli-loading", function() {
        it("Can pull multiple queries", async function() {
            const sql = `
            -- @query query1
            SELECT * FROM users;;

            -- @query query2
            SELECT * FROM users
            WHERE id = @id

            `;
            const queries = load(sql);
            expect(queries, "Parsed both querys").to.have.all.keys('query1', 'query2');
            expect(queries.query1.generate({}).text, "Parsed query1").to.equal(`SELECT * FROM users;`);
            expect(queries.query2.generate({ id: 1 }).text, "Parsed query2").to.equal(`SELECT * FROM users
            WHERE id = $1`);
            expect(queries.query2.generate({ id: 1 }).values[0], "Parsed query2 keys value 0").to.equal(1);
        });

    })
    describe("Conditional Inserts", function() {
        it("Can insert", async function() {
            const q = new Query(
                `SELECT * FROM users @id?{WHERE id = @id}`
            );
            query = q.generate({ id: 1 });
            expect(query.text, "Correct Text").to.equal(`SELECT * FROM users WHERE id = $1`);
            expect(query.values, "Correct values length").to.have.length(1);
            expect(query.values[0], "Correct values").to.equal(1);
        });
        it("Can insert (with spacing)", async function() {
            const query = new Query(
                `SELECT * FROM users @id ? { WHERE id = @id }`
            ).generate({ id: 1 });
            expect(query.text, "Correct Text").to.equal(`SELECT * FROM users WHERE id = $1`);
            expect(query.values, "Correct values length").to.have.length(1);
            expect(query.values[0], "Correct values").to.equal(1);
        });
        it("Can no-op when missing", async function() {
            const query = new Query(
                `SELECT * FROM users @id?{WHERE id = @id}`
            ).generate({ id: undefined });
            expect(query.text, "Correct Text").to.equal(`SELECT * FROM users `);
            expect(query.values, "Correct values length").to.have.length(0);
        });

        it("Can insert else", async function() {
            const q = new Query(
                `SELECT * FROM users WHERE @id?{id = @id}:{id IS NULL}`
            );
            let query = q.generate({ id: 1 });
            expect(query.text, "Correct success Text").to.equal(`SELECT * FROM users WHERE id = $1`);
            expect(query.values, "Correct success values length").to.have.length(1);
            expect(query.values[0], "Correct success values").to.equal(1);
            query = q.generate({ id: undefined });
            expect(query.text, "Correct failure Text").to.equal(`SELECT * FROM users WHERE id IS NULL`);
            expect(query.values, "Correct failure values length").to.have.length(0);
        });

        it("Syntax error on missing `?`", async function() {
            expect(() => new Query(
                `SELECT * FROM users @id{WHERE id = @id}`
            )).to.throw(SyntaxError);
        });
    })
    describe("Comments", function() {
        it("Can drop single line comments", async function() {
            const query = new Query(
                `
                -- This is a comment
                -- And so is this
                UPDATE table SET
                    email = @email -- and also this
                -- And this
                WHERE t.id = @id
                `
            ).generate({ id: 1 });
            expect(query.text, "Drops comments").to.equal(`
                UPDATE table SET
                    email = $1
                WHERE t.id = $2
                `);
        });
        it("Can drop wrapped comments", async function() {
            const query = new Query(
                `/* This is a single line wrapped comment */
                UPDATE table SET
                    email/* This is awkwardly placed */ = @email
                WHERE t.id = @id
                `
            ).generate({ id: 1 });
            expect(query.text, "Drops comments").to.equal(`
                UPDATE table SET
                    email = $1
                WHERE t.id = $2
                `);
        });
        it("Can drop multiline comments", async function() {
            const query = new Query(
                `/*
                  * This is a multiline comment
                  */
                UPDATE table SET
                    email = @email
                WHERE t.id = @id
                `
            ).generate({ id: 1 });
            expect(query.text, "Drops comments").to.equal(`
                UPDATE table SET
                    email = $1
                WHERE t.id = $2
                `);
        });
        it("Can comment out special characters", async function() {
            const query = new Query(
                `
                UPDATE table SET
                    email = @email
                    /* id = @id */
                WHERE t.id = @id
                `
            ).generate({ id: 1 });
            expect(query.text, "Drops comments").to.equal(`
                UPDATE table SET
                    email = $1
                    
                WHERE t.id = $2
                `);
        });
        it("Can comment out inside a delimited array", async function() {
            const query = new Query(
                `
                UPDATE table SET (,)[
                    email = @email;
                    name = @name;
                    /* id = @id; */
                ] WHERE t.id = @id`
            ).generate({ id: 1 });
            expect(query.text, "Drops comments").to.equal(`
                UPDATE table SET email = $1, name = $2 WHERE t.id = $3`);
        });
    });

    describe("Spread Operator", function() {
        const query = new Query(
            `SELECT * FROM users WHERE id in ((,)[ ...@ids ])`
        );
        it("Can spread an array", async function() {
            const { text, values } = query.generate({ ids: [ 2, 3, 4 ] });
            expect(text, "Correct Text").to.equal(`SELECT * FROM users WHERE id in ($1, $2, $3)`);
            expect(values, "Spread 3 values").to.have.length(3);
            expect(values[0], "Value 1").to.equal(2);
            expect(values[1], "Value 1").to.equal(3);
            expect(values[2], "Value 1").to.equal(4);
        });
    })

    describe("Delimited Lists", function() {
        it("Ignores empty arrays", async function() {
            const query = new Query(
                `SELECT * FROM users (,)[]`
            ).generate({});
            expect(query.text, "Correct Text").to.equal(`SELECT * FROM users `);
        });
        it("Ignores empty arrays (even if there are comments)", async function() {
            const query = new Query(
                `SELECT * FROM users(,)[/*comment*/ /*<- this internal space gets trimmed*/]`
            ).generate({});
            expect(query.text, "Correct Text").to.equal(`SELECT * FROM users`); // <- no terminal space
        });
        it("Ignores empty arrays (even if there are useless ';'s)", async function() {
            const query = new Query(
                `SELECT * FROM users(,)[ ; ; ; ]`
            ).generate({});
            expect(query.text, "Correct Text").to.equal(`SELECT * FROM users`); // <- no terminal spaces
        });
        it("Ignores empty arrays (even if there are useless ';'s and comments)", async function() {
            const query = new Query(
                `SELECT * FROM users(,)[ ;/*this*/ /*is trimmed*/; ; ]`
            ).generate({});
            expect(query.text, "Correct Text").to.equal(`SELECT * FROM users`); // <- no terminal spaces
        });
        it("Can delimit static arrays", async function() {
            const query = new Query(
                `SELECT (,)[ id; name ] FROM users`
            ).generate({});
            expect(query.text, "Correct Text").to.equal(`SELECT id, name FROM users`);
        });
        it("Can delimit static arrays with terminal `;`", async function() {
            const query = new Query(
                `SELECT (,)[ id; name; ] FROM users`
            ).generate({});
            expect(query.text, "Correct Text").to.equal(`SELECT id, name FROM users`);
        });
        it("Can delimit static arrays with extra `;`", async function() {
            const query = new Query(
                `SELECT (,)[ id; ; ; name; ] FROM users`
            ).generate({});
            expect(query.text, "Correct Text").to.equal(`SELECT id, name FROM users`);
        });
        it("Can delimit static arrays with extra lines", async function() {
            const query = new Query(
                `SELECT (,)[
                    id;
                    name;
                ] FROM users`
            ).generate({});
            expect(query.text, "Correct Text").to.equal(`SELECT id, name FROM users`);
        });
        it("Can delimit static arrays with extra lines and comments", async function() {
            const query = new Query(
                `SELECT (,)[
                    id; -- Comment
                    name;
                ] FROM users`
            ).generate({});
            expect(query.text, "Correct Text").to.equal(`SELECT id, name FROM users`);
        });
        it("Can delimit static arrays with extra lines and multiline comments", async function() {
            const query = new Query(
                `SELECT (,)[
                    id; /* This is also painful */
                    name;
                    /* And so is this */
                    email;
                ] FROM users`
            ).generate({});
            expect(query.text, "Correct Text").to.equal(`SELECT id, name, email FROM users`);
        });
        it("Can delimit variable-containing arrays", async function() {
            const query = new Query(
                `SELECT (,)[ id; @name AS name; ] FROM users`
            ).generate({ name: "bob" });
            expect(query.text, "Correct Text").to.equal(`SELECT id, $1 AS name FROM users`);
            expect(query.values[0], "Correct value").to.equal("bob");
        });
        it("Can delimit variable arrays with extra lines and comments", async function() {
            const query = new Query(
                `SELECT (,)[
                    @id; -- Comment
                    @name;
                ] FROM users`
            ).generate({});
            expect(query.text, "Correct Text").to.equal(`SELECT $1, $2 FROM users`);
        });
        it("Can delimit conditional arrays", async function() {
            const query = new Query(
                `SELECT (,)[ id; @name?{name}; ] FROM users`
            ).generate({ name: true });
            expect(query.text, "Correct Text").to.equal(`SELECT id, name FROM users`);
        });
        it("Can delimit conditional with 'else's in arrays", async function() {
            const q = new Query(
                `SELECT (,)[ id; @name?{@name}:{name}; ] FROM users`
            );
            expect(q.is_static, "Isn't static").to.equal(false);
            expect(q.keys, "Correct keys").to.have.length(1);
            expect(q.keys[0], "Correct key value").to.equal("name");
            let qauery;

            query = q.generate({ name: "Bob" });
            expect(query.text, "Correct success Text").to.equal(`SELECT id, $1 FROM users`);
            query = q.generate({ name: undefined });
            expect(query.text, "Correct Text").to.equal(`SELECT id, name FROM users`);
        });
        it("Can filter out empty conditional array before delimiting", async function() {
            const query = new Query(
                `SELECT (,)[ id; @email?{email}; @name?{name}; ] FROM users`
            ).generate({ name: true });
            expect(query.text, "Correct Text").to.equal(`SELECT id, name FROM users`);
        });
    })

    describe("Nesting", function() {
        it("Can support arrays in arrays", async function() {
            const query = new Query(
                `SELECT (,)[ id; (&)[ active; recent ] AS valid; ] FROM users`
            ).generate({});
            expect(query.text, "Correct Text").to.equal(`SELECT id, active AND recent AS valid FROM users`);
        });
        it("Can support arrays in conditionals", async function() {
            const query = new Query(
                `SELECT id FROM users @id?{WHERE (&)[ id IS NOT NULL; id = @id ] }`
            ).generate({ id: 1 });
            expect(query.text, "Correct Text").to.equal(`SELECT id FROM users WHERE id IS NOT NULL AND id = $1`);
        });
    })
})

