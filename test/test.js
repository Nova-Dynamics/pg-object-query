

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
        const query1 = new Query(
            `
            SELECT * FROM table AS t
            WHERE t.id = @id
                OR t.other = @other
                OR t.id = @id
            `
        ).generate({ id: 1, other: "bob" });

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


        const query2 = new Query(
            `SELECT * FROM table AS t`
        ).generate({});
        it("Empty queries can render", async function() {
            expect(query2.text, "Renders text").to.equal(`SELECT * FROM table AS t`);
        });
        it("Empty queries are empty", async function() {
            expect(query2.values, "Identifies query as empty").to.have.length(0);
        });
    });
    describe("Fallbacks", function() {
        const query = new Query(
            `
            UPDATE table SET
                name = @name??name,
                t_type = @type
            WHERE id = @id
            `
        );

        it("Renders values", async function() {
            const { text, values } = query.generate({ id: 1, name: "bob", type: "green" });
            expect(text, "Renders text").to.equal(`
            UPDATE table SET
                name = $1,
                t_type = $2
            WHERE id = $3
            `);
            expect(values, "Gets all three values").to.have.length(3);
            expect(values[0], "First key is from name").to.equal("bob");
            expect(values[1], "Second key is from type").to.equal("green");
            expect(values[2], "Third key is from id").to.equal(1);
        });
        it("Renders undefined (with no fallback)", async function() {
            const { text, values } = query.generate({ id: undefined, name: "bob", type: "green" });
            expect(text, "Renders text").to.equal(`
            UPDATE table SET
                name = $1,
                t_type = $2
            WHERE id = $3
            `);
            expect(values, "Gets all three values").to.have.length(3);
            expect(values[0], "First key is from name").to.equal("bob");
            expect(values[1], "Second key is from type").to.equal("green");
            expect(values[2], "Third key is from id").to.equal(undefined);
        });
        it("Renders undefined as fallback", async function() {
            const { text, values } = query.generate({ id: 1, name: undefined, type: "green" });
            expect(text, "Renders text").to.equal(`
            UPDATE table SET
                name = name,
                t_type = $1
            WHERE id = $2
            `);
            expect(values, "Gets all only two values").to.have.length(2);
            expect(values[0], "First key is from type").to.equal("green");
            expect(values[1], "Second key is from id").to.equal(1);
        });
        it("Renders undefined as fallback but only if requested", async function() {
            const query = new Query(
                `UPDATE table SET
                    name = @name??name,
                    t_type = @type
                WHERE name is not @name`
            );
            const { text, values } = query.generate({ name: undefined, type: "green" });
            expect(text, "Renders text").to.equal(
                `UPDATE table SET
                    name = name,
                    t_type = $1
                WHERE name is not $2`);
            expect(values, "Gets all two values").to.have.length(2);
            expect(values[0], "First key is from type").to.equal("green");
            expect(values[1], "Second key is from name").to.equal(undefined);
        });
    });
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
            const query = new Query(
                `SELECT * FROM users @id?{WHERE id = @id}`
            ).generate({ id: 1 });
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
        it("Can delimit variable-containing arrays", async function() {
            const query = new Query(
                `SELECT (,)[ id; @name AS name; ] FROM users`
            ).generate({ name: "bob" });
            expect(query.text, "Correct Text").to.equal(`SELECT id, $1 AS name FROM users`);
            expect(query.values[0], "Correct value").to.equal("bob");
        });
        it("Can delimit conditional arrays", async function() {
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

