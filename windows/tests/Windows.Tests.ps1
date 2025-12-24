# OpenPath Windows Pester Tests
# Tests for all PowerShell modules

BeforeAll {
    # Import modules
    $modulePath = Join-Path $PSScriptRoot ".." "lib"
    Import-Module "$modulePath\Common.psm1" -Force
}

Describe "Common Module" {
    Context "Test-AdminPrivileges" {
        It "Returns a boolean value" {
            $result = Test-AdminPrivileges
            $result | Should -BeOfType [bool]
        }
    }

    Context "Write-OpenPathLog" {
        BeforeAll {
            $testLogPath = "$env:TEMP\openpath-test.log"
        }

        It "Writes INFO level logs" {
            { Write-OpenPathLog -Message "Test INFO message" -Level INFO } | Should -Not -Throw
        }

        It "Writes WARN level logs" {
            { Write-OpenPathLog -Message "Test WARN message" -Level WARN } | Should -Not -Throw
        }

        It "Writes ERROR level logs" {
            { Write-OpenPathLog -Message "Test ERROR message" -Level ERROR } | Should -Not -Throw
        }
    }

    Context "Get-PrimaryDNS" {
        It "Returns a valid IP address string" {
            $dns = Get-PrimaryDNS
            $dns | Should -Not -BeNullOrEmpty
            $dns | Should -Match '^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$'
        }
    }

    Context "Get-OpenPathFromUrl" {
        It "Throws when URL is invalid" {
            { Get-OpenPathFromUrl -Url "https://invalid.example.com/404" } | Should -Throw
        }
    }

    Context "Test-InternetConnection" {
        It "Returns a boolean value" {
            $result = Test-InternetConnection
            $result | Should -BeOfType [bool]
        }
    }
}

Describe "DNS Module" {
    BeforeAll {
        $modulePath = Join-Path $PSScriptRoot ".." "lib"
        Import-Module "$modulePath\DNS.psm1" -Force -ErrorAction SilentlyContinue
    }

    Context "Test-AcrylicInstalled" {
        It "Returns a boolean value" {
            $result = Test-AcrylicInstalled
            $result | Should -BeOfType [bool]
        }
    }

    Context "Get-AcrylicPath" {
        It "Returns null or valid path" {
            $path = Get-AcrylicPath
            if ($path) {
                Test-Path $path | Should -BeTrue
            } else {
                $path | Should -BeNullOrEmpty
            }
        }
    }

    Context "Update-AcrylicHosts" {
        It "Generates valid hosts content" -Skip:(-not (Test-AcrylicInstalled)) {
            $result = Update-AcrylicHosts -WhitelistedDomains @("example.com", "test.com") -BlockedSubdomains @()
            $result | Should -BeTrue
        }
    }
}

Describe "Firewall Module" {
    BeforeAll {
        $modulePath = Join-Path $PSScriptRoot ".." "lib"
        Import-Module "$modulePath\Firewall.psm1" -Force -ErrorAction SilentlyContinue
    }

    Context "Test-FirewallActive" {
        It "Returns a boolean value" {
            $result = Test-FirewallActive
            $result | Should -BeOfType [bool]
        }
    }

    Context "Get-FirewallStatus" {
        It "Returns a hashtable with expected keys" {
            $status = Get-FirewallStatus
            $status | Should -BeOfType [hashtable]
            $status.Keys | Should -Contain "TotalRules"
            $status.Keys | Should -Contain "AllowRules"
            $status.Keys | Should -Contain "BlockRules"
        }
    }
}

Describe "Browser Module" {
    BeforeAll {
        $modulePath = Join-Path $PSScriptRoot ".." "lib"
        Import-Module "$modulePath\Browser.psm1" -Force -ErrorAction SilentlyContinue
    }

    Context "Set-FirefoxPolicies" {
        It "Returns a boolean value" {
            $result = Set-FirefoxPolicies -BlockedPaths @()
            $result | Should -BeOfType [bool]
        }
    }

    Context "Set-ChromePolicies" {
        It "Does not throw with empty blocked paths" -Skip:(-not (Test-AdminPrivileges)) {
            { Set-ChromePolicies -BlockedPaths @() } | Should -Not -Throw
        }
    }
}

Describe "Services Module" {
    BeforeAll {
        $modulePath = Join-Path $PSScriptRoot ".." "lib"
        Import-Module "$modulePath\Services.psm1" -Force -ErrorAction SilentlyContinue
    }

    Context "Get-OpenPathTaskStatus" {
        It "Returns an array or empty result" {
            $status = Get-OpenPathTaskStatus
            $status | Should -BeOfType [array] -Or $status | Should -BeNullOrEmpty
        }
    }

    Context "Register-OpenPathTasks" {
        It "Accepts custom interval parameters" -Skip:(-not (Test-AdminPrivileges)) {
            # Just verify the function signature works
            { Register-OpenPathTasks -UpdateIntervalMinutes 10 -WatchdogIntervalMinutes 2 -WhatIf } | Should -Not -Throw
        }
    }
}
