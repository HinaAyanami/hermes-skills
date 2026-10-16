// 对照探针骨架：把「旧判定逻辑」和「新判定逻辑」并排跑在同一份真实输入上。
//
// 用途：证明一个失效的 Windows 小工具到底错在哪、修复是否真的生效。
// 典型输出（这是能贴给用户看的证据）：
//     ORIGINAL logic says running : False
//     FIXED    logic says running : True
//
// 编译（C# 5，用 Windows 自带编译器；不要用字符串插值 / nameof / ?.）：
//   C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe /nologo /target:exe /out:Probe.exe Probe.cs
// 运行：cd 到能复现问题的工作目录再跑（工作目录本身往往就是变量之一）

using System;
using System.Diagnostics;
using System.IO;
using System.Net.Sockets;
using System.Text;

class Probe
{
    // ---- 1. 取一份真实输入。改这里成你要验的东西 ----
    // 例：向本地服务发一个和原工具一模一样的裸请求，把原始响应拿回来
    static string CaptureRealInput(int port)
    {
        using (TcpClient c = new TcpClient())
        {
            IAsyncResult ar = c.BeginConnect("127.0.0.1", port, null, null);
            if (!ar.AsyncWaitHandle.WaitOne(1000)) return "<connect timeout>";
            c.EndConnect(ar);
            NetworkStream s = c.GetStream();
            s.ReadTimeout = 2000;
            byte[] req = Encoding.ASCII.GetBytes("GET / HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n");
            s.Write(req, 0, req.Length);
            s.Flush();
            byte[] buf = new byte[65536];
            MemoryStream ms = new MemoryStream();
            int n;
            while ((n = s.Read(buf, 0, buf.Length)) > 0)
            {
                ms.Write(buf, 0, n);
                if (ms.Length > 65536) break;
            }
            return Encoding.UTF8.GetString(ms.ToArray());
        }
    }

    // ---- 2. 逐字复制原工具的判定逻辑（不要"改进"它，要让它原样失败） ----
    static bool OldLogic(string content)
    {
        return content.IndexOf("__MAGIC_MARK__", StringComparison.OrdinalIgnoreCase) >= 0;
    }

    // ---- 3. 修复后的判定逻辑 ----
    static bool NewLogic(string content)
    {
        if (content.IndexOf("__MAGIC_MARK__", StringComparison.OrdinalIgnoreCase) >= 0) return true;
        // 上游加了凭据：裸请求拿到 401 也说明服务在跑，否则启动逻辑会死循环
        if (content.IndexOf("authentication required", StringComparison.OrdinalIgnoreCase) >= 0) return true;
        return false;
    }

    // ---- 4. 也验一下「抓取凭据/入口 URL」这类新逻辑，正则要吃真实输出格式 ----
    static void CheckScraper(string realSample)
    {
        System.Text.RegularExpressions.Match m = System.Text.RegularExpressions.Match(
            realSample, "https?://(?:127\\.0\\.0\\.1|localhost):[0-9]+/\\?token=[A-Za-z0-9_\\-]+");
        Console.WriteLine("scraper on real output : " + (m.Success ? m.Value : "<NO MATCH>"));
    }

    // ---- 另一类探针：验进程启动方式。旧的走 PATH，新的走绝对路径 ----
    static void SpawnCompare()
    {
        Console.WriteLine("cwd = " + Environment.CurrentDirectory);
        TryRun("OLD: ProcessStartInfo(\"tool.cmd\", args)  [PATH lookup]",
               new ProcessStartInfo("tool.cmd", "--version"));
        // 新的：解析绝对路径，或直接解释器 + 入口 js
        // TryRun("NEW: node.exe + absolute entry.js", new ProcessStartInfo(nodeExe, "\"" + entryJs + "\" --version"));
    }

    static void TryRun(string label, ProcessStartInfo psi)
    {
        psi.UseShellExecute = false;
        psi.RedirectStandardOutput = true;
        psi.RedirectStandardError = true;
        psi.CreateNoWindow = true;
        Console.WriteLine("--- " + label);
        try
        {
            using (Process p = Process.Start(psi))
            {
                string o = p.StandardOutput.ReadToEnd();
                string e = p.StandardError.ReadToEnd();
                p.WaitForExit(120000);
                Console.WriteLine("    exit = " + p.ExitCode);
                if (o.Trim().Length > 0) Console.WriteLine("    stdout: " + o.Trim().Replace("\r", "").Replace("\n", " | "));
                if (e.Trim().Length > 0)
                {
                    string flat = e.Trim().Replace("\r", "").Replace("\n", " | ");
                    Console.WriteLine("    stderr: " + (flat.Length > 300 ? flat.Substring(0, 300) : flat));
                }
            }
        }
        catch (Exception ex) { Console.WriteLine("    threw: " + ex.Message); }
    }

    static void Main()
    {
        string input = CaptureRealInput(3080);
        string head = input.Length > 300 ? input.Substring(0, 300) : input;
        Console.WriteLine("=== real input, " + input.Length + " chars ===");
        Console.WriteLine(head.Replace("\r", "").Replace("\n", " | "));
        Console.WriteLine();
        Console.WriteLine("ORIGINAL logic says running : " + OldLogic(input));
        Console.WriteLine("FIXED    logic says running : " + NewLogic(input));
        Console.WriteLine();
        CheckScraper("tool: http://127.0.0.1:3080/?token=EXAMPLE-TOKEN-VALUE");
        // SpawnCompare();  // 需要验进程启动方式时打开
    }
}
