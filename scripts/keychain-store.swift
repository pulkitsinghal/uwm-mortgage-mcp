import Foundation
import Security

guard CommandLine.arguments.count == 3 else {
  exit(64)
}

let service = CommandLine.arguments[1]
let account = CommandLine.arguments[2]
let secret = FileHandle.standardInput.readDataToEndOfFile()
guard !secret.isEmpty else {
  exit(65)
}

let query: [CFString: Any] = [
  kSecClass: kSecClassGenericPassword,
  kSecAttrService: service,
  kSecAttrAccount: account,
]

var status = SecItemUpdate(query as CFDictionary, [kSecValueData: secret] as CFDictionary)
if status == errSecItemNotFound {
  var item = query
  item[kSecValueData] = secret
  item[kSecAttrLabel] = service
  status = SecItemAdd(item as CFDictionary, nil)
}

exit(status == errSecSuccess ? 0 : 1)
