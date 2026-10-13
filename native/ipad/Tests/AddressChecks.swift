import Foundation

@main
struct AddressChecks {
    static func main() {
        for address in ["http://127.0.0.1:4322", "http://192.168.1.20:4322", "http://mac.local:4322", "https://studio.example"] {
            precondition(StudioAddress.parse(address, allowLocalHTTP: true) != nil, address)
        }
        for address in ["javascript:alert(1)", "file:///tmp/a", "http://public.example", "http://10.999.0.1", "https://user:password@studio.example", "https://studio.example/?token=abc", "https://studio.example/path"] {
            precondition(StudioAddress.parse(address, allowLocalHTTP: true) == nil, address)
        }
        precondition(StudioAddress.parse("http://127.0.0.1:4322", allowLocalHTTP: false) == nil)
        precondition(StudioAddress.parse("https://studio.example", allowLocalHTTP: false) != nil)
        let base = URL(string: "https://studio.example")
        precondition(StudioAddress.sameOrigin(base, URL(string: "https://studio.example:443/?invite=ABC")))
        precondition(!StudioAddress.sameOrigin(base, URL(string: "https://studio.example.evil.test")))
        precondition(!StudioAddress.sameOrigin(base, URL(string: "http://studio.example")))
        precondition(!StudioAddress.sameOrigin(base, URL(string: "https://studio.example:444")))
        precondition(!StudioAddress.sameOrigin(base, nil))
        print("Native address and origin checks passed.")
    }
}
