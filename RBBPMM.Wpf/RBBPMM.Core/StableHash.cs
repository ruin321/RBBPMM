using System.Security.Cryptography;
using System.Text;

namespace RBBPMM.Core;

/// <summary>Deterministic directory-name helper. Ported from src/main/services/StableHash.ts.</summary>
public static class StableHash
{
    public static string GetStableHash(string guid, string name, string author)
    {
        var input = $"{guid}:{name}:{author}";
        var bytes = SHA256.HashData(Encoding.UTF8.GetBytes(input));
        var sb = new StringBuilder(bytes.Length * 2);
        for (var i = 0; i < 4; i++)
            sb.Append(bytes[i].ToString("x2"));
        return sb.ToString();
    }

    public static string GetModDirectoryName(string guid, string name, string author)
        => $"{name}_{GetStableHash(guid, name, author)}";
}
